const { isVideoUrl, videoPlaybackUrl, videoPosterUrl, setCoverOffset, pickCoverUrl } = require('../js/media-type');

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
