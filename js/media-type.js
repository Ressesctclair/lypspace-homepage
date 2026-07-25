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

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MediaType;
  } else {
    root.MediaType = MediaType;
  }
})(typeof window !== 'undefined' ? window : this);
