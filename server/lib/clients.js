// Validated environment configuration and shared service clients
// (Supabase database + Cloudflare R2 object storage).

import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_SECRET   = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
// Email of the single admin account used for dashboard sign-in (Supabase Auth).
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@kipakosa.app';

if (!SUPABASE_URL || !SUPABASE_SECRET) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment');
  process.exit(1);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET);

export const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
export const R2_BUCKET     = process.env.R2_BUCKET;
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

if (!R2_ACCOUNT_ID || !R2_BUCKET || !R2_PUBLIC_URL) {
  console.error('Missing R2_ACCOUNT_ID, R2_BUCKET or R2_PUBLIC_URL in environment');
  process.exit(1);
}

const r2 = (process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY)
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

/** @returns {boolean} whether direct-to-R2 uploads are available */
export function hasR2() {
  return !!r2;
}

export function getR2() {
  return r2;
}

/** Public CDN URL for an R2 object key. */
export function r2Url(key) {
  return `${R2_PUBLIC_URL}/${key}`;
}

/**
 * Build the 8th Wall image target from a cropped image: uploads a grayscale
 * luminance map to R2 and returns the target descriptor for the DB.
 * @param {Buffer} imageBuffer raw cropped image bytes
 * @param {string} projectId project id used as the R2 key prefix
 */
export async function prepareTarget(imageBuffer, projectId) {
  const meta = await sharp(imageBuffer).metadata();
  const W = meta.width || 640;
  const H = meta.height || 640;
  const aspect = W / H;

  // Scale luminance map preserving exact aspect ratio without cropping
  let lumW, lumH;
  if (W >= H) {
    lumW = 640;
    lumH = Math.max(1, Math.round(640 / aspect));
  } else {
    lumH = 640;
    lumW = Math.max(1, Math.round(640 * aspect));
  }

  const lumBuffer = await sharp(imageBuffer)
    .resize(lumW, lumH, { fit: 'fill' })
    .grayscale()
    .jpeg({ quality: 90 })
    .toBuffer();

  const lumKey = `${projectId}/luminance.jpg`;
  if (r2) {
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: lumKey,
      Body: lumBuffer,
      ContentType: 'image/jpeg',
    }));
  }

  return {
    name: 'target0',
    type: 'PLANAR',
    imagePath: r2Url(lumKey),
    metadata: { width: W, height: H },
    properties: {
      left: 0,
      top: 0,
      width: W,
      height: H,
      originalWidth: W,
      originalHeight: H,
      isRotated: false,
    },
  };
}
