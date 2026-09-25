export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export const EXTENSION_FOR: Record<ImageType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const TYPE_FOR_EXTENSION: Record<string, ImageType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * What the bytes ARE, from their file signature — never from the filename or
 * the Content-Type header a client claims. Anything that isn't a JPEG, PNG or
 * WebP returns null and is refused, so the upload endpoint can't be used to
 * host HTML, scripts or SVG.
 */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}
