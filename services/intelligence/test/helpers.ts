import sharp from 'sharp';
import { serviceSecret, signServiceToken } from '@leanplate/security';

// A fixed secret keeps tests independent of any generated dev keys on disk.
process.env.SERVICE_SECRET_INTELLIGENCE ??= 'test-intelligence-secret-0123456789-abcdefghij';

export const intelligenceSecret = () => serviceSecret('intelligence');

export async function serviceToken(opts: { issuer?: string; audience?: string; secret?: string; ttlSeconds?: number } = {}): Promise<string> {
  return signServiceToken({
    secret: opts.secret ?? intelligenceSecret(),
    issuer: opts.issuer ?? 'meals',
    audience: opts.audience ?? 'intelligence',
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  return { 'x-service-token': await serviceToken(), 'content-type': 'application/json', ...extra };
}

/** A small, valid JPEG of a flat colour. */
export async function plainJpeg(width = 320, height = 240): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 180, g: 120, b: 60 } } }).jpeg({ quality: 90 }).toBuffer();
}

/** A JPEG that carries EXIF with GPS coordinates, camera details and a rotation flag. */
export async function jpegWithGps(width = 3000, height = 2000): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 90, g: 160, b: 80 } } })
    .withExif({
      IFD0: { Make: 'SecretCam', Model: 'Model-X', Copyright: 'Jane Doe', ImageDescription: 'At home, 12 Elm Street' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '40/1 44/1 5400/100',
        GPSLongitudeRef: 'W',
        GPSLongitude: '73/1 59/1 1200/100',
      },
    })
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 92 })
    .toBuffer();
}

export const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64');

/** Pads so the schema's minimum length for dataBase64 is met by tiny payloads. */
export const payload = (buf: Buffer, mediaType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg') => ({ mediaType, dataBase64: b64(buf) });
