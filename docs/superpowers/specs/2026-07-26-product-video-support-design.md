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

**Type detection:** a URL is treated as a video if it ends in `.mp4`, `.webm`, `.mov`, or `.m4v` (case-insensitive, ignoring any trailing `?query` or `#fragment`). This means uploaded video URLs must be stored with the correct file extension (see below) — this is the single source of truth for image-vs-video branching everywhere.

**Cover frame selection:** the merchant picks which frame of the video becomes its static cover, by scrubbing a video player and confirming — not an automatic/default frame. The chosen timestamp is encoded directly in the stored URL as a trailing media-fragment, e.g. `https://res.cloudinary.com/.../video/upload/lyp-space/clip.mp4#t=12.5`. This needs no database change: it's just more characters on the same string already stored in `images`. Two derived helpers consume it:
- **Poster image** (what admin/customer see as the static thumbnail): the `#t=` value becomes a Cloudinary `so_<seconds>` (start-offset) transformation when requesting the `.jpg` derivative, e.g. `.../video/upload/so_12.5/lyp-space/clip.jpg`. No `#t=` present → falls back to Cloudinary's default first-frame `.jpg`.
- **Playback URL** (what actually gets set as `<video src>`, everywhere the video plays): the `#t=` fragment is always stripped first. Fragments are never sent to the server and browsers may otherwise try to seek to it as an initial position — stripping keeps playback starting from 0:00 every time, independent of which frame was chosen as the cover.

## Admin changes (`admin-products.html`)

1. **Drop zone / file input**: `accept="image/*,video/*"` (currently `image/*` only). Drag-and-drop handler is unchanged — it already forwards `event.dataTransfer.files` to `uploadImages()`.
2. **`uploadImages(files)`**: for each file, check `file.type.startsWith('video/')`.
   - Video files POST to `https://api.cloudinary.com/v1_1/${sig.cloud_name}/video/upload` instead of `.../image/upload`. The existing signed params (`timestamp`, `signature`, `api_key`, `folder`) are unaffected — Cloudinary's signature only covers the params sent, not the resource type, so no change needed in `api/checkout.js`'s `sign-upload` handler.
   - Build the stored URL from the response as `https://res.cloudinary.com/${sig.cloud_name}/video/upload/${d.public_id}.${d.format}` (e.g. `....mp4`) — must include the extension so front-end type detection works. No `c_fill,ar_3:4` image transform (doesn't apply to video).
   - Image files keep the exact current behavior (`/image/upload`, `c_fill,g_auto,ar_3:4,w_800,q_auto,f_auto` transform).
3. **Cover frame picker**: a small modal with a `<video controls>` player and a "Set as cover" button.
   - Opens **automatically right after a video finishes uploading** (queued one-at-a-time if multiple videos were dropped at once).
   - Can also be **reopened anytime** by clicking an existing video's tile in the preview grid, to change the chosen frame later.
   - Confirming reads `video.currentTime`, rewrites that entry's line in the `#ed-images` textarea with the `#t=<seconds>` fragment appended, and refreshes the preview grid.
4. **Thumbnail preview grid**: for a URL identified as a video, render its poster image (per the cover-frame logic above) instead of the raw video, with a small ▶ badge overlay in the corner so the merchant can tell it's a video at a glance, and make the tile clickable to reopen the cover frame picker. Clicking/removing the corresponding textarea line behaves the same as image thumbnails today.

## Storefront changes (`product.html`)

1. **Main gallery** (`renderProduct()` / `switchImage()`): when the active index's URL is a video, render a `<video autoplay muted loop playsinline>` in place of `<img id="main-img-el">` (both elements can coexist in the DOM with one hidden, to keep `switchImage`'s cross-fade timing intact). The `<video src>` is always the fragment-stripped playback URL (see cover-frame selection above) so it plays from 0:00 regardless of the chosen cover frame. Switching away from a video pauses and resets it (`currentTime = 0`) so it doesn't keep playing off-screen or resume mid-clip next time.
2. **Mute/unmute control**: a small speaker icon button overlaid bottom-right of the video (only rendered for video slides). Default state muted. Click toggles `video.muted`. State does not need to persist across slide changes — each video starts muted per platform autoplay requirements.
3. **Zoom/pan/pinch** (`applyTransform`, wheel handler, touch handlers): these currently operate on `#main-img-el`. They will no-op when the active slide is a video (skip scale/pan math entirely) — pinch-zooming a video isn't meaningful. Swipe-left/right and the prev/next arrow buttons continue to switch slides normally regardless of media type.
4. **Thumbnail row** (`thumbsHtml`): video thumbnails use the same cover-frame poster URL as the admin preview grid, plus the same small ▶ badge. Thumbnails never autoplay.

## Catalog card fix (`catalog.html:264`)
`const img = p.images[0] || ''` currently assumes index 0 is always a displayable `<img>`. Once merchants can put a video first, this would render a broken image icon on the storefront grid. Fix: pick the first URL in `p.images` that is **not** a video for the card cover; if every entry is a video, fall back to that video's Cloudinary poster-frame URL. Card markup/styling is unchanged — only the URL selected for `src` changes.

## Out of scope / explicitly not doing
- No change to variant, price, or checkout logic.
- No change to how many images/videos can be uploaded, or file-size limits (relies on Cloudinary's existing account limits).
- No drag-to-reorder UI beyond what exists today (order is still edited via the images textarea).
- Catalog card video thumbnails do not autoplay on hover — poster frame only, matching the "keep the touched surface minimal" mandate.

## Risk / locked-surface note
This touches `product.html`'s main image gallery, which the user has previously flagged as finished/locked (see `feedback_locked_features_policy` memory) and `admin-products.html`'s upload flow. All new behavior is additive branching on media type — existing pure-image behavior (zoom, pan, swipe, thumbnails, upload) is unchanged when no video is present in a product's `images` array.
