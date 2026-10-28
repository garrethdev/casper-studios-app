import sharp from 'sharp';
import { AppError, sniffImage } from '@leanplate/security';
import type { AnalyzeRequest } from '@leanplate/contracts';
import type { PreparedImage, PreparedInput } from './ports';

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_PIXELS = 25_000_000;
export const MAX_SIDE = 1024;
export const JPEG_QUALITY = 80;
export const MAX_TEXT_CHARS = 500;

/* ------------------------------------------------------------------ *
 * Images
 * ------------------------------------------------------------------ */

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function decodeBase64(data: string): Buffer {
  const clean = data.replace(/\s+/g, '');
  if (clean.length === 0 || clean.length % 4 === 1 || !BASE64.test(clean)) {
    throw new AppError(422, 'bad_image', 'That file is not a readable photo. Try taking the photo again.');
  }
  // Refuse before decoding anything that would come out well over the limit.
  if (Math.floor((clean.length * 3) / 4) > MAX_IMAGE_BYTES + 3) {
    throw new AppError(422, 'image_too_large', 'That photo is too large. Try a smaller one (under 3 MB).');
  }
  return Buffer.from(clean, 'base64');
}

/**
 * Makes an uploaded photo safe and small: checks the real file type from its
 * bytes (the declared type is ignored), enforces size limits, applies the EXIF
 * rotation, then re-encodes to a plain JPEG so every piece of metadata
 * (EXIF, GPS, camera, thumbnails, ICC, XMP) is gone.
 */
export async function preprocessImage(image: NonNullable<AnalyzeRequest['image']>): Promise<PreparedImage> {
  const raw = decodeBase64(image.dataBase64);
  if (raw.length > MAX_IMAGE_BYTES) {
    throw new AppError(422, 'image_too_large', 'That photo is too large. Try a smaller one (under 3 MB).');
  }
  if (!sniffImage(raw)) {
    throw new AppError(422, 'bad_image', 'That file is not a supported photo. Please use a JPEG, PNG or WebP image.');
  }

  try {
    const probe = await sharp(raw, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata();
    const w = probe.width ?? 0;
    const h = probe.height ?? 0;
    if (w < 1 || h < 1) throw new AppError(422, 'bad_image', 'That photo could not be read.');
    if (w * h > MAX_PIXELS) throw new AppError(422, 'image_too_large', 'That photo has too many pixels. Try a smaller one.');

    const { data, info } = await sharp(raw, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
      .rotate() // apply EXIF orientation, then the tag is dropped
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }) // transparent PNG/WebP become white, not black
      .toColourspace('srgb')
      .jpeg({ quality: JPEG_QUALITY }) // no withMetadata(): nothing is carried over
      .toBuffer({ resolveWithObject: true });

    return { mediaType: 'image/jpeg', dataBase64: data.toString('base64'), width: info.width, height: info.height, bytes: data.length };
  } catch (err) {
    if (err instanceof AppError) throw err;
    const msg = err instanceof Error ? err.message : '';
    if (/pixel limit|exceeds/i.test(msg)) {
      throw new AppError(422, 'image_too_large', 'That photo has too many pixels. Try a smaller one.');
    }
    throw new AppError(422, 'bad_image', 'That photo could not be read. Try taking it again.');
  }
}

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */

// Zero-width, bidi-control and other invisible formatting characters, plus the BOM.
const INVISIBLE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB]/gu;
const TAG_CHARS = /[\u{E0000}-\u{E007F}]/gu;
const CONTROL = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}]/gu;

/**
 * Phrases that look like an attempt to give instructions to an AI. The text is
 * NOT altered because of them: it is only ever handled as data (it is parsed by
 * a deterministic parser or quoted as a data string for the model). The flag is
 * used to tell the user and to log, nothing more.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /\bignore\b.{0,40}\b(previous|prior|above|earlier|all)\b.{0,30}\b(instruction|prompt|rule|message)s?\b/i,
  /\bdisregard\b.{0,40}\b(instruction|prompt|rule|system)s?\b/i,
  /\b(system|developer)\s+(prompt|message|instruction)s?\b/i,
  /\b(reveal|show|print|repeat)\b.{0,30}\b(prompt|instructions|api key|secret)\b/i,
  /\byou are now\b/i,
  /\bact as\b/i,
  /\bnew instructions?\b/i,
  /\bjailbreak\b/i,
  /\bdeveloper mode\b/i,
  /\boverride\b.{0,30}\b(rules?|instructions?|safety)\b/i,
  /<\s*\/?\s*(system|assistant|instructions?)\s*>/i,
];

export function looksLikeInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

/** NFKC-normalizes, removes control and invisible characters, collapses whitespace and caps the length. */
export function sanitizeText(input: string, maxChars = MAX_TEXT_CHARS): string {
  return input
    .normalize('NFKC')
    .replace(/[\t\n\r\u000B\u000C\u0085\u2028\u2029]+/g, ' ') // line breaks become spaces, not nothing
    .replace(TAG_CHARS, '')
    .replace(INVISIBLE, '')
    .replace(CONTROL, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars)
    .trim();
}

export function preprocessText(input: string): { text: string; suspicious: boolean } {
  const text = sanitizeText(input);
  return { text, suspicious: looksLikeInjection(text) };
}

/* ------------------------------------------------------------------ *
 * Whole request
 * ------------------------------------------------------------------ */

export async function preprocess(req: Pick<AnalyzeRequest, 'image' | 'text'>): Promise<PreparedInput> {
  const out: PreparedInput = { textSuspicious: false };
  if (req.image) out.image = await preprocessImage(req.image);
  if (req.text !== undefined) {
    const { text, suspicious } = preprocessText(req.text);
    if (text.length > 0) out.text = text;
    out.textSuspicious = suspicious;
  }
  if (!out.image && (!out.text || out.text.length < 2)) {
    throw new AppError(422, 'bad_text', 'Please describe the meal in a few words, or add a photo.');
  }
  return out;
}
