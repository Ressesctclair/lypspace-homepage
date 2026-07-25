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
