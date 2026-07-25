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
