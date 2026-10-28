/** Size maths for the client-side photo downscale. The canvas work itself lives in image.ts. */
export const MAX_SIDE = 1280;
export const JPEG_QUALITY = 0.82;
/** Matches the ImagePayload limit in the contracts (base64 characters). */
export const MAX_BASE64 = 4_500_000;

export function fitWithin(width: number, height: number, maxSide = MAX_SIDE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const long = Math.max(width, height);
  if (long <= maxSide) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxSide / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Length of the base64 text for a given number of bytes. */
export const base64Length = (bytes: number) => 4 * Math.ceil(bytes / 3);
