# Product Video Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin drag a video into the existing product-image uploader, pick which frame of it becomes the cover by scrubbing a player, and have it play (autoplay, muted, loop, with a tap-to-unmute icon) inline in the storefront product gallery alongside photos.

**Architecture:** A new shared, dependency-free JS module (`js/media-type.js`) holds all video/image URL-classification and cover-frame logic (dual CommonJS + browser global export, so it's unit-testable under the existing Jest/Node setup with zero new tooling). `admin-products.html`, `product.html`, and `catalog.html` each load it as a `<script defer>` and call into it — no page duplicates the classification logic. The chosen cover frame is carried as a `#t=<seconds>` fragment on the stored video URL itself (no DB schema change); it's read only when deriving a poster JPG and always stripped before the URL is used as a real `<video src>`.

**Tech Stack:** Vanilla JS (no framework, no bundler), Jest (`testEnvironment: node`, no jsdom), Cloudinary signed uploads + `so_<seconds>` video-thumbnail transformation, Supabase (`custom_products.images` — untouched).

## Global Constraints

- No new npm dependencies (no jsdom). Keep `js/media-type.js` framework-free, dual-exporting via `typeof module !== 'undefined' ? module.exports : window.MediaType`, matching the codebase's existing Node-env Jest setup (see `__tests__/checkout-admin-orders.test.js` for the `require(...)` pattern this mirrors).
- Video/image type detection is by URL file extension only: `/\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i` (ignoring any trailing `?query` or `#fragment`) = video, everything else = image. This is the single source of truth — every task that needs to know "is this a video" calls `MediaType.isVideoUrl()`, never a hand-rolled regex.
- **Cover-frame fragment convention:** a video URL may carry a trailing `#t=<seconds>` (e.g. `.../clip.mp4#t=12.5`) recording which frame the merchant picked as the cover. Two rules, enforced everywhere a video URL is consumed:
  1. Deriving a **poster/thumbnail image** → use `MediaType.videoPosterUrl(url)`, which reads the `#t=` offset (if present) and requests that exact Cloudinary frame; no fragment → Cloudinary's default first frame.
  2. Setting an actual **`<video src>` for playback** → use `MediaType.videoPlaybackUrl(url)`, which always strips the fragment, so playback starts at 0:00 regardless of the chosen cover frame.
  Never set `<video src>` or compare/store URLs using the raw, un-stripped string except when writing it into the `#ed-images` textarea (where the fragment is the whole point).
- `product.html`'s image gallery (`renderProduct`, `switchImage`, the wheel/touch/mouse zoom handlers) is a previously-finalized, "locked" surface per project policy — every change to it must be strictly additive (branch on `isVideoUrl`), never altering existing pure-image behavior.
- This codebase has **no jsdom / browser-DOM test harness** — `js/pannable.js`, `js/cart.js`, `js/i18n.js` have zero automated coverage today, verified only by hand in a browser. Tasks that touch DOM/network wiring in the three HTML files follow that same existing convention: manual verification via `vercel dev` in a real browser, not new test infrastructure. Only the pure, DOM-free logic in `js/media-type.js` gets Jest unit tests (this **is** new-but-precedented coverage, following the `api/checkout.js` unit-test pattern).
- Cloudinary signed-upload endpoint (`api/checkout.js` `sign-upload` action) is unchanged — its signature only covers `folder` + `timestamp`, which is resource-type-agnostic, so video uploads reuse it as-is.

---

### Task 1: `js/media-type.js` — `isVideoUrl()`

**Files:**
- Create: `js/media-type.js`
- Test: `__tests__/media-type.test.js`

**Interfaces:**
- Produces: `MediaType.isVideoUrl(url: string) => boolean` — used by every later task (admin preview, cover-frame picker, catalog cover pick, product gallery, thumbnails).

- [ ] **Step 1: Write the failing test**

Create `__tests__/media-type.test.js`:

```js
const { isVideoUrl } = require('../js/media-type');

describe('isVideoUrl', () => {
  test('returns true for common video extensions', () => {
    expect(isVideoUrl('https://res.cloudinary.com/dhsgdejtf/video/upload/lyp-space/clip.mp4')).toBe(true);
    expect(isVideoUrl('https://example.com/x.webm')).toBe(true);
    expect(isVideoUrl('https://example.com/x.mov')).toBe(true);
    expect(isVideoUrl('https://example.com/x.m4v')).toBe(true);
    expect(isVideoUrl('https://example.com/X.MP4')).toBe(true); // case-insensitive
  });

  test('returns true when the URL has a query string after the extension', () => {
    expect(isVideoUrl('https://example.com/x.mp4?v=2')).toBe(true);
  });

  test('returns false for image extensions and non-video strings', () => {
    expect(isVideoUrl('https://res.cloudinary.com/dhsgdejtf/image/upload/c_fill/lyp-space/nix1.jpg')).toBe(false);
    expect(isVideoUrl('https://example.com/x.png')).toBe(false);
    expect(isVideoUrl('')).toBe(false);
  });

  test('returns false for null/undefined input', () => {
    expect(isVideoUrl(null)).toBe(false);
    expect(isVideoUrl(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/media-type.test.js`
Expected: FAIL — `Cannot find module '../js/media-type'`

- [ ] **Step 3: Write minimal implementation**

Create `js/media-type.js`:

```js
(function (root) {
  'use strict';

  var VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;

  function isVideoUrl(url) {
    if (!url) return false;
    return VIDEO_EXT_RE.test(url);
  }

  var MediaType = { isVideoUrl: isVideoUrl };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MediaType;
  } else {
    root.MediaType = MediaType;
  }
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/media-type.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add js/media-type.js __tests__/media-type.test.js
git commit -m "feat: add isVideoUrl media-type helper"
```

---

### Task 2: `js/media-type.js` — cover-frame helpers (`videoPlaybackUrl`, `videoPosterUrl`, `setCoverOffset`)

**Files:**
- Modify: `js/media-type.js`
- Test: `__tests__/media-type.test.js`

**Interfaces:**
- Consumes: `isVideoUrl` from Task 1 (same file).
- Produces:
  - `MediaType.videoPlaybackUrl(url: string) => string` — strips any `#t=` fragment. Used everywhere a video URL becomes an actual `<video src>` (Task 5 picker, Task 7 main gallery).
  - `MediaType.videoPosterUrl(url: string) => string` — a Cloudinary derivative URL returning a static JPG frame, honoring a `#t=<seconds>` fragment as the Cloudinary `so_<seconds>` start-offset if present. Used by the admin preview grid (Task 6), product thumbnail row (Task 9), and `pickCoverUrl` (Task 3).
  - `MediaType.setCoverOffset(url: string, seconds: number) => string` — returns the fragment-stripped URL with a new `#t=<rounded seconds>` appended. Used by the cover-frame picker (Task 5) to write the merchant's chosen frame back into the URL.
- **Also widens `isVideoUrl`'s regex** to `/\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i` so a URL carrying a `#t=` fragment is still recognized as a video (query-string handling from Task 1 is preserved — this is a strict superset).

- [ ] **Step 1: Write the failing tests**

Replace the top of `__tests__/media-type.test.js` (the single `require` line) with:

```js
const { isVideoUrl, videoPlaybackUrl, videoPosterUrl, setCoverOffset } = require('../js/media-type');
```

Add these new `describe` blocks to the file:

```js
describe('isVideoUrl with a cover-frame fragment', () => {
  test('still recognizes a video URL that carries a #t= fragment', () => {
    expect(isVideoUrl('https://example.com/x.mp4#t=12.5')).toBe(true);
  });
});

describe('videoPlaybackUrl', () => {
  test('strips a #t= fragment', () => {
    expect(videoPlaybackUrl('https://example.com/x.mp4#t=12.5')).toBe('https://example.com/x.mp4');
  });

  test('returns the URL unchanged when there is no fragment', () => {
    expect(videoPlaybackUrl('https://example.com/x.mp4')).toBe('https://example.com/x.mp4');
  });

  test('returns null/undefined input unchanged', () => {
    expect(videoPlaybackUrl(null)).toBe(null);
    expect(videoPlaybackUrl(undefined)).toBe(undefined);
  });
});

describe('videoPosterUrl', () => {
  test('swaps the video extension for .jpg, keeping the /video/upload/ path, when there is no cover fragment', () => {
    expect(videoPosterUrl('https://res.cloudinary.com/dhsgdejtf/video/upload/lyp-space/clip.mp4'))
      .toBe('https://res.cloudinary.com/dhsgdejtf/video/upload/lyp-space/clip.jpg');
  });

  test('inserts a so_<seconds> transformation when a #t= cover fragment is present', () => {
    expect(videoPosterUrl('https://res.cloudinary.com/dhsgdejtf/video/upload/lyp-space/clip.mp4#t=12.5'))
      .toBe('https://res.cloudinary.com/dhsgdejtf/video/upload/so_12.5/lyp-space/clip.jpg');
  });

  test('strips a query string when swapping extension (no fragment)', () => {
    expect(videoPosterUrl('https://example.com/x.webm?v=2')).toBe('https://example.com/x.jpg');
  });

  test('returns the input unchanged if it is not a video URL', () => {
    const img = 'https://example.com/x.png';
    expect(videoPosterUrl(img)).toBe(img);
  });
});

describe('setCoverOffset', () => {
  test('appends a #t= fragment with the given seconds, rounded to 2 decimals', () => {
    expect(setCoverOffset('https://example.com/x.mp4', 12.5)).toBe('https://example.com/x.mp4#t=12.5');
    expect(setCoverOffset('https://example.com/x.mp4', 3.14159)).toBe('https://example.com/x.mp4#t=3.14');
  });

  test('replaces an existing #t= fragment rather than appending a second one', () => {
    expect(setCoverOffset('https://example.com/x.mp4#t=1', 20)).toBe('https://example.com/x.mp4#t=20');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/media-type.test.js`
Expected: FAIL — `videoPlaybackUrl is not a function` (and similarly for the other two new exports)

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `js/media-type.js`:

```js
(function (root) {
  'use strict';

  var VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i;
  var COVER_OFFSET_RE = /#t=([\d.]+)/;

  function isVideoUrl(url) {
    if (!url) return false;
    return VIDEO_EXT_RE.test(url);
  }

  function videoPlaybackUrl(url) {
    if (!url) return url;
    var hashIdx = url.indexOf('#');
    return hashIdx === -1 ? url : url.slice(0, hashIdx);
  }

  function videoPosterUrl(url) {
    if (!isVideoUrl(url)) return url;
    var jpgUrl = videoPlaybackUrl(url).replace(VIDEO_EXT_RE, '.jpg');
    var offsetMatch = COVER_OFFSET_RE.exec(url);
    if (!offsetMatch) return jpgUrl;
    return jpgUrl.replace('/video/upload/', '/video/upload/so_' + offsetMatch[1] + '/');
  }

  function setCoverOffset(url, seconds) {
    var base = videoPlaybackUrl(url);
    var rounded = Math.round(seconds * 100) / 100;
    return base + '#t=' + rounded;
  }

  var MediaType = {
    isVideoUrl: isVideoUrl,
    videoPlaybackUrl: videoPlaybackUrl,
    videoPosterUrl: videoPosterUrl,
    setCoverOffset: setCoverOffset
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MediaType;
  } else {
    root.MediaType = MediaType;
  }
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/media-type.test.js`
Expected: PASS (all tests from Task 1 + Task 2)

- [ ] **Step 5: Commit**

```bash
git add js/media-type.js __tests__/media-type.test.js
git commit -m "feat: add cover-frame helpers to media-type (videoPlaybackUrl, videoPosterUrl, setCoverOffset)"
```

---

### Task 3: `js/media-type.js` — `pickCoverUrl()`

**Files:**
- Modify: `js/media-type.js`
- Test: `__tests__/media-type.test.js`

**Interfaces:**
- Consumes: `isVideoUrl`, `videoPosterUrl` from this file.
- Produces: `MediaType.pickCoverUrl(images: string[]) => string` — used by `catalog.html` (Task 4) to pick a card's cover image without ever pointing an `<img>` tag at a raw video file.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/media-type.test.js` (and add `pickCoverUrl` to the top `require` destructure):

```js
describe('pickCoverUrl', () => {
  test('returns the first image URL when the array starts with an image', () => {
    const images = ['https://x.com/a.jpg', 'https://x.com/b.mp4'];
    expect(pickCoverUrl(images)).toBe('https://x.com/a.jpg');
  });

  test('skips a leading video and returns the first actual image', () => {
    const images = ['https://x.com/a.mp4', 'https://x.com/b.jpg', 'https://x.com/c.png'];
    expect(pickCoverUrl(images)).toBe('https://x.com/b.jpg');
  });

  test('falls back to the poster frame of the first video when every entry is a video', () => {
    const images = ['https://x.com/a.mp4', 'https://x.com/b.webm'];
    expect(pickCoverUrl(images)).toBe('https://x.com/a.jpg');
  });

  test('honors a #t= cover fragment on the fallback video', () => {
    const images = ['https://res.cloudinary.com/dhsgdejtf/video/upload/lyp-space/a.mp4#t=5'];
    expect(pickCoverUrl(images)).toBe('https://res.cloudinary.com/dhsgdejtf/video/upload/so_5/lyp-space/a.jpg');
  });

  test('returns empty string for an empty or missing array', () => {
    expect(pickCoverUrl([])).toBe('');
    expect(pickCoverUrl(undefined)).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/media-type.test.js`
Expected: FAIL — `pickCoverUrl is not a function`

- [ ] **Step 3: Write minimal implementation**

In `js/media-type.js`, add `pickCoverUrl` and include it in the exports object:

```js
  function pickCoverUrl(images) {
    if (!images || !images.length) return '';
    var firstImage = images.find(function (u) { return !isVideoUrl(u); });
    if (firstImage) return firstImage;
    return videoPosterUrl(images[0]);
  }

  var MediaType = {
    isVideoUrl: isVideoUrl,
    videoPlaybackUrl: videoPlaybackUrl,
    videoPosterUrl: videoPosterUrl,
    setCoverOffset: setCoverOffset,
    pickCoverUrl: pickCoverUrl
  };
```

(Insert the `pickCoverUrl` function definition right after `setCoverOffset`, and add `pickCoverUrl: pickCoverUrl` to the `MediaType` object — everything else in the file from Task 2 is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/media-type.test.js`
Expected: PASS (all tests from Tasks 1-3)

- [ ] **Step 5: Commit**

```bash
git add js/media-type.js __tests__/media-type.test.js
git commit -m "feat: add pickCoverUrl media-type helper"
```

---

### Task 4: Wire `catalog.html` card cover selection to `pickCoverUrl`

**Files:**
- Modify: `catalog.html:7-8` (script tags), `catalog.html:264` (cover selection)

**Interfaces:**
- Consumes: `MediaType.pickCoverUrl` from Task 3 (loaded via `<script src="/js/media-type.js" defer>`).

- [ ] **Step 1: Add the script include**

In `catalog.html`, change lines 7-8 from:

```html
  <script src="/js/i18n.js" defer></script>
  <script src="/js/cart.js" defer></script>
```

to:

```html
  <script src="/js/i18n.js" defer></script>
  <script src="/js/cart.js" defer></script>
  <script src="/js/media-type.js" defer></script>
```

- [ ] **Step 2: Replace the cover-image selection line**

In `catalog.html:264`, change:

```js
        const img = p.images[0] || '';
```

to:

```js
        const img = MediaType.pickCoverUrl(p.images);
```

(`loadProducts()` is `async` and resolves after network fetches complete — by then the `defer`red `media-type.js` has already run, so `MediaType` is guaranteed to exist. See Global Constraints.)

- [ ] **Step 3: Manual verification (no jsdom in this repo — see Global Constraints)**

Run: `vercel dev` (from repo root)

In a browser:
1. Open `http://localhost:3000/catalog` — confirm every existing product card still shows its normal photo cover (no regression for photo-only products).
2. Revisit this check after Task 5 ships a real test video: temporarily make a test product's first `images` entry a video URL and confirm its catalog card shows a still frame, not a broken image icon. Revert the test edit afterward.

- [ ] **Step 4: Commit**

```bash
git add catalog.html
git commit -m "fix: pick a real image (or video poster) for catalog card covers"
```

---

### Task 5: `admin-products.html` — accept, upload, and pick a cover frame for videos

**Files:**
- Modify: `admin-products.html:1-6` (script include), `admin-products.html:178-186` (drop zone + file input), `admin-products.html:681-718` (`uploadImages`), plus new modal markup near the end of `<body>` and new JS functions after `updateImgPreview`.

**Interfaces:**
- Consumes: `MediaType.isVideoUrl`, `MediaType.videoPlaybackUrl`, `MediaType.setCoverOffset` from Tasks 1/2.
- Produces:
  - Video uploads land in Cloudinary's `video/upload` resource type and get appended to the `#ed-images` textarea as `https://res.cloudinary.com/<cloud>/video/upload/<public_id>.<format>` — a URL `MediaType.isVideoUrl()` recognizes.
  - `queueCoverPicker(urls: string[])`, `openCoverPicker(url: string)`, `closeCoverPicker()`, `confirmCoverFrame()` — `openCoverPicker` is also called directly from Task 6's preview-grid tile click handler.

This task is deliberately one unit rather than split further: the cover-frame picker only exists to handle videos the upload step just produced, and `uploadImages` calling `queueCoverPicker` only makes sense once both pieces (and the `media-type.js` script include they both depend on) land together — splitting them would leave an intermediate state where the page references undefined functions.

- [ ] **Step 1: Load `media-type.js`**

In `admin-products.html`, after line 6 (`<title>Product Manager — LYP SPACE Admin</title>`), add:

```html
  <script src="/js/media-type.js" defer></script>
```

- [ ] **Step 2: Widen the drop zone / file input to accept video**

In `admin-products.html`, change line 183-186 from:

```html
        <div style="font-size:13px;color:var(--gray)">Drop images here or click to browse</div>
        <div id="upload-status" style="font-size:12px;color:var(--gray);margin-top:6px"></div>
      </div>
      <input type="file" id="img-upload" accept="image/*" multiple style="display:none" onchange="uploadImages(this.files)">
```

to:

```html
        <div style="font-size:13px;color:var(--gray)">Drop images or videos here or click to browse</div>
        <div id="upload-status" style="font-size:12px;color:var(--gray);margin-top:6px"></div>
      </div>
      <input type="file" id="img-upload" accept="image/*,video/*" multiple style="display:none" onchange="uploadImages(this.files)">
```

- [ ] **Step 3: Branch `uploadImages` on file type and queue the cover-frame picker for any videos**

In `admin-products.html:681-718`, replace the whole `uploadImages` function:

```js
  async function uploadImages(files) {
    if (!files || !files.length) return;
    const status = document.getElementById('upload-status');
    status.textContent = `Uploading ${files.length} file(s)…`;

    try {
      const sigRes = await fetch('/api/checkout?action=sign-upload');
      const sig = await sigRes.json();

      const uploaded = [];
      for (const file of files) {
        const isVideo = file.type.startsWith('video/');
        const fd = new FormData();
        fd.append('file', file);
        fd.append('timestamp', sig.timestamp);
        fd.append('signature', sig.signature);
        fd.append('api_key', sig.api_key);
        fd.append('folder', sig.folder);
        const resourceType = isVideo ? 'video' : 'image';
        const r = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/${resourceType}/upload`, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.public_id) {
          const url = isVideo
            ? `https://res.cloudinary.com/${sig.cloud_name}/video/upload/${d.public_id}.${d.format}`
            // Apply same transformation as existing products
            : `https://res.cloudinary.com/${sig.cloud_name}/image/upload/c_fill,g_auto,ar_3:4,w_800,q_auto,f_auto/${d.public_id}`;
          uploaded.push(url);
        }
      }

      const ta = document.getElementById('ed-images');
      const existing = ta.value.trim();
      ta.value = (existing ? existing + '\n' : '') + uploaded.join('\n');
      updateImgPreview();
      status.textContent = `✓ ${uploaded.length} uploaded`;
      setTimeout(() => status.textContent = '', 3000);

      const newVideoUrls = uploaded.filter(u => MediaType.isVideoUrl(u));
      if (newVideoUrls.length) queueCoverPicker(newVideoUrls);
    } catch(e) {
      status.textContent = 'Upload failed: ' + e.message;
    }
    // Reset file input so same file can be re-uploaded
    document.getElementById('img-upload').value = '';
  }
```

(Compared to today's version: `resourceType` is computed per-file from `file.type`, the upload URL branches to Cloudinary's `video/upload` path with a `.${d.format}` extension when `isVideo`, and the last two new lines hand any newly-uploaded video URLs to `queueCoverPicker`, defined in Step 5 below.)

- [ ] **Step 4: Add the cover-frame picker modal markup**

Find the closing `</body>` tag in `admin-products.html` and insert this immediately before it:

```html
  <div id="cover-picker-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1000;align-items:center;justify-content:center">
    <div style="background:#fff;padding:20px;max-width:420px;width:90%">
      <p style="font-size:13px;margin-bottom:10px;color:var(--gray)">拖动进度条选择封面帧,点击"设为封面"确认</p>
      <video id="cover-picker-video" controls style="width:100%;max-height:300px;background:#000;display:block"></video>
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
        <button type="button" onclick="closeCoverPicker()" style="padding:8px 16px;border:1px solid var(--border);background:#fff;cursor:pointer">Cancel</button>
        <button type="button" onclick="confirmCoverFrame()" style="padding:8px 16px;border:none;background:var(--black);color:#fff;cursor:pointer">Set as Cover</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 5: Add the picker JS functions**

In `admin-products.html`, immediately after the existing `updateImgPreview` function, add:

```js
  // ── Cover-frame picker ──────────────────────────────────────────
  let _coverPickerUrl = null;
  let _coverPickerQueue = [];

  function queueCoverPicker(urls) {
    _coverPickerQueue = _coverPickerQueue.concat(urls);
    if (!_coverPickerUrl) openCoverPicker(_coverPickerQueue.shift());
  }

  function openCoverPicker(url) {
    _coverPickerUrl = url;
    const vid = document.getElementById('cover-picker-video');
    vid.src = MediaType.videoPlaybackUrl(url);
    document.getElementById('cover-picker-modal').style.display = 'flex';
  }

  function closeCoverPicker() {
    const vid = document.getElementById('cover-picker-video');
    vid.pause();
    vid.removeAttribute('src');
    _coverPickerUrl = null;
    document.getElementById('cover-picker-modal').style.display = 'none';
    if (_coverPickerQueue.length) openCoverPicker(_coverPickerQueue.shift());
  }

  function confirmCoverFrame() {
    const vid = document.getElementById('cover-picker-video');
    const ta = document.getElementById('ed-images');
    const lines = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
    const idx = lines.indexOf(_coverPickerUrl);
    if (idx !== -1) {
      lines[idx] = MediaType.setCoverOffset(_coverPickerUrl, vid.currentTime);
      ta.value = lines.join('\n');
      updateImgPreview();
    }
    closeCoverPicker();
  }
```

- [ ] **Step 6: Manual verification (no jsdom in this repo — see Global Constraints)**

Run: `vercel dev` (from repo root)

In a browser:
1. Open `/admin-products`, log in, open any product editor.
2. Drag a short `.mp4` file into the drop zone.
3. Confirm `upload-status` shows "Uploading 1 file(s)…" then "✓ 1 uploaded".
4. Confirm the cover-frame modal pops up automatically right after, showing the video with native controls.
5. Scrub to a distinctive frame (e.g. partway through), click "Set as Cover".
6. Confirm the modal closes and the corresponding line in `#ed-images` now ends in `.mp4#t=<some number>`.
7. Drag in two `.mp4` files at once — confirm the picker opens for the first, and immediately after clicking "Set as Cover" (or "Cancel"), it reopens for the second without you having to re-trigger anything.
8. Click "Cancel" once — confirm the modal closes and that video's textarea line is unchanged (no `#t=` added).
9. Drag a `.jpg` in alongside a video — confirm the photo still uploads via the old `image/upload` path with the `c_fill,...` transform prefix, unchanged from before this task, and does not trigger the cover picker.

- [ ] **Step 7: Commit**

```bash
git add admin-products.html
git commit -m "feat: accept video uploads and add a cover-frame picker in the product image uploader"
```

---

### Task 6: `admin-products.html` — video poster + badge in upload preview grid

**Files:**
- Modify: `admin-products.html:74-75` (CSS), `admin-products.html:548-553` (`updateImgPreview`)

**Interfaces:**
- Consumes: `MediaType.isVideoUrl`, `MediaType.videoPosterUrl` from Task 1/2. Calls `openCoverPicker` from Task 5 when a video tile is clicked.

- [ ] **Step 1: Add badge + clickable-tile CSS**

In `admin-products.html`, change lines 74-75 from:

```css
    .img-preview{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
    .img-preview img{width:60px;height:60px;object-fit:contain;background:var(--light);border:1px solid var(--border)}
```

to:

```css
    .img-preview{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
    .img-preview .preview-item{position:relative;width:60px;height:60px}
    .img-preview img{width:60px;height:60px;object-fit:contain;background:var(--light);border:1px solid var(--border)}
    .img-preview .preview-item.is-video{cursor:pointer}
    .img-preview .video-badge{position:absolute;bottom:2px;right:2px;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;display:flex;align-items:center;justify-content:center;font-size:8px;pointer-events:none}
```

- [ ] **Step 2: Render poster + badge for video URLs, wire click to reopen the picker**

In `admin-products.html:548-553`, replace `updateImgPreview`:

```js
  function updateImgPreview() {
    const urls = document.getElementById('ed-images').value.split('\n').map(s => s.trim()).filter(Boolean);
    document.getElementById('img-preview').innerHTML = urls.slice(0, 8).map(u => {
      const isVideo = MediaType.isVideoUrl(u);
      const thumbSrc = isVideo ? MediaType.videoPosterUrl(u) : u;
      const clickAttr = isVideo ? ` data-video-url="${esc(u)}" onclick="openCoverPicker(this.dataset.videoUrl)"` : '';
      return `<div class="preview-item${isVideo ? ' is-video' : ''}"${clickAttr}><img src="${esc(thumbSrc)}" alt="" onerror="this.style.opacity=.3">${isVideo ? '<span class="video-badge">&#9654;</span>' : ''}</div>`;
    }).join('');
  }
```

- [ ] **Step 3: Manual verification (no jsdom in this repo — see Global Constraints)**

Run: `vercel dev` (from repo root)

In a browser:
1. Open `/admin-products`, open the product you uploaded a video to in Task 5.
2. Confirm the preview grid shows the exact frame you picked in Task 5 (not a default first frame) with a small ▶ badge in the corner, and normal photos render exactly as before (no badge, unchanged size/border, not clickable-looking).
3. Click the video's preview tile — confirm the cover-frame picker (Task 5) reopens, pre-loaded with that video; pick a different frame, confirm, and see the preview grid update to the new frame.
4. Confirm removing/editing the textarea lines still updates the preview live (existing `input` listener behavior, untouched).

- [ ] **Step 4: Commit**

```bash
git add admin-products.html
git commit -m "feat: show chosen cover frame + play badge for videos in admin image preview"
```

---

### Task 7: `product.html` — render & play video in the main gallery

**Files:**
- Modify: `product.html:7-9` (script include), `product.html:57-75` (CSS), `product.html:337-350` (`renderProduct`'s main-image block), `product.html:497-509` (`switchImage`)

**Interfaces:**
- Consumes: `MediaType.isVideoUrl`, `MediaType.videoPlaybackUrl` from Task 1/2.
- Produces: `toggleMute(event)` — new function, wired to the mute-icon button's `onclick`.
- Note: `switchImage(i)`'s signature and thumbnail-highlighting behavior (`document.querySelectorAll('.thumb')...`) are unchanged — Task 9 (thumbnail rendering) and Task 8 (zoom/pan guards) both call the same `switchImage` and read `currentImgIndex` this task keeps using.

- [ ] **Step 1: Load `media-type.js`**

In `product.html`, change lines 7-9 from:

```html
  <script src="/js/i18n.js" defer></script>
  <script src="/js/cart.js" defer></script>
  <script src="/js/pannable.js" defer></script>
```

to:

```html
  <script src="/js/i18n.js" defer></script>
  <script src="/js/cart.js" defer></script>
  <script src="/js/pannable.js" defer></script>
  <script src="/js/media-type.js" defer></script>
```

- [ ] **Step 2: Add video + mute-button CSS**

In `product.html`, after line 74 (`.main-image img.zoomed { cursor: grab; }`), add:

```css
    .main-image video { width: 100%; height: 100%; object-fit: cover; object-position: 50% 50%; display: block; transition: opacity 0.22s ease; }
    .vid-mute-btn {
      position: absolute; bottom: 10px; right: 10px;
      background: rgba(255,255,255,0.85); border: none; cursor: pointer;
      width: 32px; height: 32px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; z-index: 2; padding: 0; line-height: 1;
      box-shadow: 0 1px 4px rgba(0,0,0,0.15);
    }
```

- [ ] **Step 3: Render a persistent `<video>` + mute button in `renderProduct()`**

In `product.html:337-350`, change:

```js
      const root = document.getElementById('product-root');
      currentImgIndex = 0;
      root.innerHTML = `
        <div class="product-layout">
          <div class="image-gallery">
            <div class="main-image" id="main-img">
              ${hasImages ? `<img id="main-img-el" src="${product.images[0]}" alt="${esc(product.title)}">` : ''}
              ${product.images && product.images.length > 1 ? `
                <button class="img-arrow prev" onclick="imgNav(-1)">&#8249;</button>
                <button class="img-arrow next" onclick="imgNav(1)">&#8250;</button>
              ` : ''}
            </div>
            ${thumbsHtml}
          </div>
```

to:

```js
      const firstUrl = hasImages ? product.images[0] : '';
      const firstIsVideo = MediaType.isVideoUrl(firstUrl);

      const root = document.getElementById('product-root');
      currentImgIndex = 0;
      root.innerHTML = `
        <div class="product-layout">
          <div class="image-gallery">
            <div class="main-image" id="main-img">
              <img id="main-img-el" src="${firstIsVideo ? '' : firstUrl}" alt="${esc(product.title)}" style="${firstIsVideo ? 'display:none' : ''}">
              ${hasImages ? `<video id="main-vid-el" muted loop playsinline ${firstIsVideo ? `src="${MediaType.videoPlaybackUrl(firstUrl)}" autoplay` : 'style="display:none"'}></video>` : ''}
              <button id="vid-mute-btn" class="vid-mute-btn" style="display:${firstIsVideo ? 'flex' : 'none'}" onclick="toggleMute(event)" aria-label="Toggle video sound">&#128263;</button>
              ${product.images && product.images.length > 1 ? `
                <button class="img-arrow prev" onclick="imgNav(-1)">&#8249;</button>
                <button class="img-arrow next" onclick="imgNav(1)">&#8250;</button>
              ` : ''}
            </div>
            ${thumbsHtml}
          </div>
```

(Everything below `${thumbsHtml}` in the template — `product-info`, variants, buy buttons — is untouched; only the `main-image` inner block changes.)

- [ ] **Step 4: Update `switchImage` to swap between `<img>` and `<video>`, and add `toggleMute`**

In `product.html:497-509`, replace `switchImage`:

```js
    function switchImage(i) {
      currentImgIndex = i;
      const imgEl = document.getElementById('main-img-el');
      const vidEl = document.getElementById('main-vid-el');
      const muteBtn = document.getElementById('vid-mute-btn');
      if (!imgEl || !vidEl) return;
      const url = product.images[i];
      const isVideo = MediaType.isVideoUrl(url);
      imgEl.style.opacity = '0';
      vidEl.style.opacity = '0';
      setTimeout(() => {
        vidEl.pause();
        vidEl.currentTime = 0;
        if (isVideo) {
          imgEl.removeAttribute('src');
          imgEl.style.display = 'none';
          vidEl.style.display = '';
          vidEl.muted = true;
          vidEl.src = MediaType.videoPlaybackUrl(url);
          vidEl.play().catch(() => {});
          muteBtn.style.display = 'flex';
          muteBtn.innerHTML = '&#128263;';
        } else {
          vidEl.removeAttribute('src');
          vidEl.style.display = 'none';
          muteBtn.style.display = 'none';
          imgEl.style.display = '';
          imgEl.src = url;
        }
        imgEl.style.transform = '';
        _imgScale = 1; _panX = 0; _panY = 0;
        imgEl.style.opacity = '1';
        vidEl.style.opacity = '1';
      }, 220);
      document.querySelectorAll('.thumb').forEach((t, idx) => t.classList.toggle('active', idx === i));
    }

    function toggleMute(e) {
      e.stopPropagation();
      const vidEl = document.getElementById('main-vid-el');
      const muteBtn = document.getElementById('vid-mute-btn');
      if (!vidEl) return;
      vidEl.muted = !vidEl.muted;
      muteBtn.innerHTML = vidEl.muted ? '&#128263;' : '&#128266;';
    }
```

- [ ] **Step 5: Manual verification (no jsdom in this repo — see Global Constraints)**

Run: `vercel dev` (from repo root)

In a browser, open a product page for the test product from Task 5-6 (which now has one video with a chosen cover frame + at least one photo in `images`):
1. Confirm the thumbnail/catalog card shows the picked cover frame, not the video's default first frame (proves the `#t=` fragment survived through `pickCoverUrl`/`videoPosterUrl`).
2. Click through to the video slide — confirm it starts playing automatically **from 0:00** (not from the chosen cover-frame timestamp), muted, looping, no visible controls bar.
3. Click the speaker icon — confirm sound turns on and the icon flips to the "sound on" glyph; click again — confirm it mutes again.
4. Navigate to a photo slide — confirm the video visibly pauses (open devtools, confirm `document.getElementById('main-vid-el').paused === true`) and the mute icon disappears.
5. Navigate back to the video slide — confirm it replays from the start, muted (not mid-clip, not still unmuted from step 3).
6. Confirm photo-only products (no video in `images`) look and behave completely unchanged — no mute icon ever appears, no console errors.

- [ ] **Step 6: Commit**

```bash
git add product.html
git commit -m "feat: play video slides inline in the product gallery with mute toggle"
```

---

### Task 8: `product.html` — skip pinch/zoom/pan for video slides

**Files:**
- Modify: `product.html:392-491` (`attachWheelScroll` — wheel, mouse-drag, and touch handlers)

**Interfaces:**
- Consumes: `MediaType.isVideoUrl`, `currentImgIndex`, `product.images` (all already in scope in this function per Task 7).

- [ ] **Step 1: Guard the wheel handler's zoom/pan branches**

In `product.html`, inside `attachWheelScroll()`'s wheel listener (around line 402-418), change:

```js
      el.addEventListener('wheel', function(e) {
        e.preventDefault();
        const imgEl = document.getElementById('main-img-el');
        if (e.ctrlKey) {
          const factor = e.deltaY > 0 ? 0.9 : 1.1;
          _imgScale = Math.max(1, Math.min(4, _imgScale * factor));
          if (_imgScale <= 1.05) { _imgScale = 1; _panX = 0; _panY = 0; lockSwipe(1500); }
          applyTransform(imgEl);
        } else if (_imgScale > 1.05) {
          // Pan with plain scroll when zoomed
          _panX -= e.deltaX; _panY -= e.deltaY;
          applyTransform(imgEl);
        } else if (product.images.length > 1 && !_swipeLocked) {
          lockSwipe(1500);
          switchImage((currentImgIndex + (e.deltaY > 0 ? 1 : -1) + product.images.length) % product.images.length);
        }
      }, { passive: false });
```

to:

```js
      el.addEventListener('wheel', function(e) {
        e.preventDefault();
        const imgEl = document.getElementById('main-img-el');
        const activeIsVideo = MediaType.isVideoUrl(product.images[currentImgIndex]);
        if (e.ctrlKey && !activeIsVideo) {
          const factor = e.deltaY > 0 ? 0.9 : 1.1;
          _imgScale = Math.max(1, Math.min(4, _imgScale * factor));
          if (_imgScale <= 1.05) { _imgScale = 1; _panX = 0; _panY = 0; lockSwipe(1500); }
          applyTransform(imgEl);
        } else if (!activeIsVideo && _imgScale > 1.05) {
          // Pan with plain scroll when zoomed
          _panX -= e.deltaX; _panY -= e.deltaY;
          applyTransform(imgEl);
        } else if (product.images.length > 1 && !_swipeLocked) {
          lockSwipe(1500);
          switchImage((currentImgIndex + (e.deltaY > 0 ? 1 : -1) + product.images.length) % product.images.length);
        }
      }, { passive: false });
```

- [ ] **Step 2: Guard touch pinch/pan (touchmove)**

In `product.html`, inside the `touchmove` handler (around line 453-470), change the opening of the handler:

```js
      el.addEventListener('touchmove', function(e) {
        e.preventDefault();
        const imgEl = document.getElementById('main-img-el');
        if (e.touches.length === 2 && _pinchActive && _pinchStart > 0) {
```

to:

```js
      el.addEventListener('touchmove', function(e) {
        e.preventDefault();
        const imgEl = document.getElementById('main-img-el');
        const activeIsVideo = MediaType.isVideoUrl(product.images[currentImgIndex]);
        if (!activeIsVideo && e.touches.length === 2 && _pinchActive && _pinchStart > 0) {
```

and further down in the same handler, guard the single-touch pan branch:

```js
        } else if (e.touches.length === 1 && _isPanning) {
          _panX = _panStartX + (e.touches[0].clientX - _tx);
          _panY = _panStartY + (e.touches[0].clientY - _ty);
          applyTransform(imgEl);
        }
```

becomes:

```js
        } else if (!activeIsVideo && e.touches.length === 1 && _isPanning) {
          _panX = _panStartX + (e.touches[0].clientX - _tx);
          _panY = _panStartY + (e.touches[0].clientY - _ty);
          applyTransform(imgEl);
        }
```

Leave `touchstart` and `touchend` unmodified — swipe-to-switch (the `_imgScale <= 1.05` branch in `touchend`) already only triggers when not zoomed, and zoom can no longer engage on a video slide after this step, so swipe-next/prev keeps working for videos automatically.

- [ ] **Step 3: Manual verification (no jsdom in this repo — see Global Constraints)**

Run: `vercel dev` (from repo root)

On a touch device or Chrome DevTools device-emulation + desktop:
1. On the video slide from Task 7, try ctrl+scroll (desktop) or pinch (mobile) — confirm nothing zooms and the video keeps playing normally.
2. Plain scroll / swipe left-right on the video slide — confirm it still switches to the next/previous slide.
3. On a photo slide, confirm ctrl+scroll zoom, plain-scroll pan-while-zoomed, and pinch-zoom all work exactly as before this task (no regression).

- [ ] **Step 4: Commit**

```bash
git add product.html
git commit -m "fix: disable pinch/zoom/pan on video slides in product gallery"
```

---

### Task 9: `product.html` — video poster + badge in thumbnail row

**Files:**
- Modify: `product.html:76-83` (CSS), `product.html:315-320` (`thumbsHtml`)

**Interfaces:**
- Consumes: `MediaType.isVideoUrl`, `MediaType.videoPosterUrl` from Task 1/2.

- [ ] **Step 1: Add badge CSS**

In `product.html`, change line 77-82 from:

```css
    .thumb {
      width: 72px; height: 72px; background: var(--light-gray);
      overflow: hidden; cursor: pointer; border: 2px solid transparent; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
    }
    .thumb.active { border-color: var(--black); }
```

to:

```css
    .thumb {
      width: 72px; height: 72px; background: var(--light-gray);
      overflow: hidden; cursor: pointer; border: 2px solid transparent; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      position: relative;
    }
    .thumb.active { border-color: var(--black); }
    .thumb .video-badge {
      position: absolute; bottom: 4px; right: 4px;
      width: 18px; height: 18px; border-radius: 50%;
      background: rgba(0,0,0,.6); color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 9px; pointer-events: none;
    }
```

- [ ] **Step 2: Render poster + badge for video thumbnails**

In `product.html:315-320`, replace `thumbsHtml`:

```js
      const thumbsHtml = hasImages && product.images.length > 1
        ? `<div class="thumb-row">${product.images.map((img, i) => {
            const isVideo = MediaType.isVideoUrl(img);
            const thumbSrc = isVideo ? MediaType.videoPosterUrl(img) : img;
            return `<div class="thumb ${i===0?'active':''}" onclick="switchImage(${i})">
              <img src="${thumbSrc}" alt="${esc(product.title)} ${i+1}" loading="lazy">
              ${isVideo ? '<span class="video-badge">&#9654;</span>' : ''}
            </div>`;
          }).join('')}</div>` : '';
```

- [ ] **Step 3: Manual verification (no jsdom in this repo — see Global Constraints)**

Run: `vercel dev` (from repo root)

In a browser, open the test product page again:
1. Confirm the video's thumbnail shows the picked cover frame with a ▶ badge, and photo thumbnails are unchanged (no badge).
2. Click the video thumbnail — confirm it activates the video slide (Task 7 behavior) and gets the `.active` border like any other thumbnail.
3. Confirm thumbnails never autoplay (they're plain `<img>`, not `<video>`).

- [ ] **Step 4: Commit**

```bash
git add product.html
git commit -m "feat: show cover frame + play badge for video thumbnails"
```

---

## Post-plan cleanup

- [ ] Delete the test video/image lines from the product used for manual verification in Tasks 5-9 (or leave them if the user wants to keep the test video live — confirm with the user before removing real product data).
- [ ] Run the full test suite once more: `npx jest` — expect all suites (including the pre-existing `checkout-*` tests) to pass, confirming no cross-contamination.
