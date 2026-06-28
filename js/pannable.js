(function () {
  'use strict';

  var active = null;
  var states = new WeakMap();

  // Remove Cloudinary aspect-ratio crop so original image proportions are served.
  // Converts e.g. "c_fill,g_auto,ar_3:4,w_800" → "c_scale,w_800"
  function stripAr(url) {
    if (!url || !url.includes('cloudinary.com')) return url;
    return url
      .replace(/c_(?:fill|thumb),g_\w+,ar_\d+:\d+,/g, 'c_scale,')
      .replace(/,?ar_\d+:\d+/g, '');
  }

  function getState(img) {
    if (!states.has(img)) {
      states.set(img, { px: 50, py: 50 });
      img.addEventListener('dragstart', function (e) { e.preventDefault(); });
    }
    return states.get(img);
  }

  function calcOverflow(img) {
    var wrap = img.parentElement;
    if (!wrap) return { x: 0, y: 0 };
    var cw = wrap.offsetWidth, ch = wrap.offsetHeight;
    var nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return { x: 0, y: 0 };
    var s = Math.max(cw / nw, ch / nh);
    return { x: Math.max(0, nw * s - cw), y: Math.max(0, nh * s - ch) };
  }

  function isCover(el) {
    return el && el.tagName === 'IMG' && window.getComputedStyle(el).objectFit === 'cover';
  }

  function applyPan(img, dx, dy) {
    var ov = calcOverflow(img);
    var s = getState(img);
    if (ov.x > 0) s.px = Math.max(0, Math.min(100, s.px - (dx / ov.x) * 100));
    if (ov.y > 0) s.py = Math.max(0, Math.min(100, s.py - (dy / ov.y) * 100));
    img.style.objectPosition = s.px + '% ' + s.py + '%';
  }

  // ── Mouse ────────────────────────────────────────────────────────────
  document.addEventListener('mousedown', function (e) {
    if (!isCover(e.target)) return;
    active = { img: e.target, lx: e.clientX, ly: e.clientY, moved: false };
    e.target.style.cursor = 'grabbing';
    document.body.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', function (e) {
    if (!active) return;
    var dx = e.clientX - active.lx, dy = e.clientY - active.ly;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      applyPan(active.img, dx, dy);
      active.moved = true;
    }
    active.lx = e.clientX;
    active.ly = e.clientY;
  });

  document.addEventListener('mouseup', function () {
    if (!active) return;
    active.img.style.cursor = 'grab';
    document.body.style.cursor = '';
    if (active.moved) {
      var img = active.img;
      img.addEventListener('click', function block(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        img.removeEventListener('click', block, true);
      }, { capture: true, once: true });
    }
    active = null;
  });

  // ── Touch ────────────────────────────────────────────────────────────
  document.addEventListener('touchstart', function (e) {
    if (!isCover(e.target)) return;
    active = { img: e.target, lx: e.touches[0].clientX, ly: e.touches[0].clientY, moved: false };
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', function (e) {
    if (!active) return;
    var dx = e.touches[0].clientX - active.lx, dy = e.touches[0].clientY - active.ly;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      applyPan(active.img, dx, dy);
      active.moved = true;
    }
    active.lx = e.touches[0].clientX;
    active.ly = e.touches[0].clientY;
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', function () { active = null; });

  // ── Init ─────────────────────────────────────────────────────────────
  function setup() {
    document.querySelectorAll('img').forEach(function (img) {
      if (!isCover(img)) return;
      var src = img.getAttribute('src');
      if (src) {
        var stripped = stripAr(src);
        if (stripped !== src) img.src = stripped;
      }
      var s = getState(img);
      img.style.objectPosition = s.px + '% ' + s.py + '%';
      img.style.cursor = 'grab';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }

  window.pannableSetup = setup;
  window.pannableStripAr = stripAr;
})();
