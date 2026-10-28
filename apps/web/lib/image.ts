import { JPEG_QUALITY, MAX_BASE64, MAX_SIDE, base64Length, fitWithin } from './image-fit';

export interface PreparedImage {
  /** Raw base64 (no data: prefix) of a JPEG with no metadata. */
  dataBase64: string;
  mediaType: 'image/jpeg';
  /** Object URL for the preview. Revoke it when done. */
  previewUrl: string;
  width: number;
  height: number;
}

const ACCEPTED = /^image\/(jpeg|png|webp|heic|heif)$/i;

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' applies the EXIF orientation, so a portrait phone photo is not drawn sideways.
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // fall through to the <img> path
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('read failed'));
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.readAsDataURL(blob);
  });
}

/**
 * Downscales to at most 1280 px on the long side and re-encodes as JPEG (quality 0.82) in a canvas.
 * Doing it in the browser before upload keeps the request small, and because only pixels are redrawn,
 * EXIF data such as GPS position and camera serial number is dropped.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ACCEPTED.test(file.type)) throw new Error('Please choose a photo (JPEG, PNG or WebP).');
  if (file.size > 40 * 1024 * 1024) throw new Error('That file is very large. Please choose a normal photo.');
  const decoded = await decode(file);
  try {
    let side = MAX_SIDE;
    let quality = JPEG_QUALITY;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { width, height } = fitWithin(decoded.width, decoded.height, side);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Your browser could not process the photo.');
      ctx.fillStyle = '#fff'; // JPEG has no transparency
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(decoded.source, 0, 0, width, height);
      const blob = await canvasToBlob(canvas, quality);
      if (base64Length(blob.size) <= MAX_BASE64) {
        return { dataBase64: await blobToBase64(blob), mediaType: 'image/jpeg', previewUrl: URL.createObjectURL(blob), width, height };
      }
      side = Math.round(side * 0.75); // very rare: keep shrinking until it fits
      quality = Math.max(0.6, quality - 0.08);
    }
    throw new Error('That photo is too detailed to send. Try another one.');
  } catch (e) {
    throw e instanceof Error ? e : new Error('Could not read that photo.');
  } finally {
    decoded.close();
  }
}
