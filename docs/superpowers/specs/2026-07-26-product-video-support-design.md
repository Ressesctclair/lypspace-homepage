# Product Video Support — Design

## Goal
Let the merchant drag a video into the same admin image uploader used today, and have that video play (muted, autoplay, loop) inline in the storefront product gallery alongside photos — with a tap-to-unmute control for the customer.

## Scope
- `admin-products.html` — upload flow + thumbnail preview grid
- `product.html` — main image gallery + thumbnail row
- `catalog.html` — product card cover-image selection (latent bug this feature would otherwise expose)
- No database schema change. No change to `api/checkout.js` upload-signature logic.

## Data model
Videos and photos continue to live together in the existing `images` string array (Supabase `custom_products.images`), in display order. No new field.

**Type detection:** a URL is treated as a video if it ends in `.mp4`, `.webm`, `.mov`, or `.m4v` (case-insensitive). This means uploaded video URLs must be stored with the correct file extension (see below) — this is the single source of truth for image-vs-video branching everywhere.

## Admin changes (`admin-products.html`)

1. **Drop zone / file input**: `accept="image/*,video/*"` (currently `image/*` only). Drag-and-drop handler is unchanged — it already forwards `event.dataTransfer.files` to `uploadImages()`.
2. **`uploadImages(files)`**: for each file, check `file.type.startsWith('video/')`.
   - Video files POST to `https://api.cloudinary.com/v1_1/${sig.cloud_name}/video/upload` instead of `.../image/upload`. The existing signed params (`timestamp`, `signature`, `api_key`, `folder`) are unaffected — Cloudinary's signature only covers the params sent, not the resource type, so no change needed in `api/checkout.js`'s `sign-upload` handler.
   - Build the stored URL from the response as `https://res.cloudinary.com/${sig.cloud_name}/video/upload/${d.public_id}.${d.format}` (e.g. `....mp4`) — must include the extension so front-end type detection works. No `c_fill,ar_3:4` image transform (doesn't apply to video).
   - Image files keep the exact current behavior (`/image/upload`, `c_fill,g_auto,ar_3:4,w_800,q_auto,f_auto` transform).
3. **Thumbnail preview grid**: for a URL identified as a video, render its Cloudinary-generated poster frame (swap `/video/upload/` path to request a `.jpg` derivative — Cloudinary auto-extracts a frame) instead of the raw video, with a small ▶ badge overlay in the corner so the merchant can tell it's a video at a glance. Clicking/removing behaves the same as image thumbnails today.

## Storefront changes (`product.html`)

1. **Main gallery** (`renderProduct()` / `switchImage()`): when the active index's URL is a video, render a `<video autoplay muted loop playsinline>` in place of `<img id="main-img-el">` (both elements can coexist in the DOM with one hidden, to keep `switchImage`'s cross-fade timing intact). Switching away from a video pauses and resets it (`currentTime = 0`) so it doesn't keep playing off-screen or resume mid-clip next time.
2. **Mute/unmute control**: a small speaker icon button overlaid bottom-right of the video (only rendered for video slides). Default state muted. Click toggles `video.muted`. State does not need to persist across slide changes — each video starts muted per platform autoplay requirements.
3. **Zoom/pan/pinch** (`applyTransform`, wheel handler, touch handlers): these currently operate on `#main-img-el`. They will no-op when the active slide is a video (skip scale/pan math entirely) — pinch-zooming a video isn't meaningful. Swipe-left/right and the prev/next arrow buttons continue to switch slides normally regardless of media type.
4. **Thumbnail row** (`thumbsHtml`): video thumbnails use the same Cloudinary poster-frame URL trick as the admin preview grid (append `.jpg` derivative), plus the same small ▶ badge. Thumbnails never autoplay.

## Catalog card fix (`catalog.html:264`)
`const img = p.images[0] || ''` currently assumes index 0 is always a displayable `<img>`. Once merchants can put a video first, this would render a broken image icon on the storefront grid. Fix: pick the first URL in `p.images` that is **not** a video for the card cover; if every entry is a video, fall back to that video's Cloudinary poster-frame URL. Card markup/styling is unchanged — only the URL selected for `src` changes.

## Out of scope / explicitly not doing
- No change to variant, price, or checkout logic.
- No change to how many images/videos can be uploaded, or file-size limits (relies on Cloudinary's existing account limits).
- No drag-to-reorder UI beyond what exists today (order is still edited via the images textarea).
- Catalog card video thumbnails do not autoplay on hover — poster frame only, matching the "keep the touched surface minimal" mandate.

## Risk / locked-surface note
This touches `product.html`'s main image gallery, which the user has previously flagged as finished/locked (see `feedback_locked_features_policy` memory) and `admin-products.html`'s upload flow. All new behavior is additive branching on media type — existing pure-image behavior (zoom, pan, swipe, thumbnails, upload) is unchanged when no video is present in a product's `images` array.
