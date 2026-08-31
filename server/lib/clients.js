// Validated environment configuration and shared service clients
// (Supabase database + Cloudflare R2 object storage).

import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import Mux from '@mux/mux-node';

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_SECRET   = process.env.SUPABASE_SERVICE_KEY;
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

export const MUX_TOKEN_ID     = process.env.MUX_TOKEN_ID;
export const MUX_TOKEN_SECRET = process.env.MUX_TOKEN_SECRET;

export const mux = (MUX_TOKEN_ID && MUX_TOKEN_SECRET)
  ? new Mux({ tokenId: MUX_TOKEN_ID, tokenSecret: MUX_TOKEN_SECRET })
  : null;

/**
 * Ingests a video URL into Mux for instant adaptive streaming and sub-second startup.
 * @param {string} videoUrl
 * @returns {Promise<{ assetId: string, playbackId: string } | null>}
 */
export async function createMuxAsset(videoUrl) {
  if (!mux) return null;
  try {
    const asset = await mux.video.assets.create({
      input: [{ url: videoUrl }],
      playback_policy: ['public'],
      mp4_support: 'capped-1080p',
    });
    const playbackId = asset.playback_ids?.find(p => p.policy === 'public')?.id || asset.playback_ids?.[0]?.id;
    return {
      assetId: asset.id,
      playbackId: playbackId || null,
      duration: asset.duration || null,
    };
  } catch (err) {
    console.error('Mux asset creation error:', err.message);
    return null;
  }
}

/**
 * Permanently deletes a video asset from Mux to terminate storage costs immediately.
 * @param {string} assetId
 * @returns {Promise<boolean>}
 */
export async function deleteMuxAsset(assetId) {
  if (!mux || !assetId) return false;
  try {
    await mux.video.assets.delete(assetId);
    return true;
  } catch (err) {
    console.warn(`Mux asset delete error (${assetId}):`, err.message);
    return false;
  }
}

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

/**
 * Build an 8th Wall multi-target image descriptor for a magazine page:
 * generates a grayscale luminance map and uploads to R2 under the magazine target prefix.
 * @param {Buffer} imageBuffer raw image bytes
 * @param {string} magazineId magazine ID
 * @param {number} targetIndex 0-based index
 * @param {string} [targetName] custom 8th Wall target identifier, defaults to `target${targetIndex}`
 */
export async function prepareMagazineTarget(imageBuffer, magazineId, targetIndex = 0, targetName = `target${targetIndex}`) {
  const meta = await sharp(imageBuffer).metadata();
  const W = meta.width || 640;
  const H = meta.height || 640;
  const aspect = W / H;

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

  const lumKey = `magazines/${magazineId}/targets/${targetIndex}/luminance.jpg`;
  if (r2) {
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: lumKey,
      Body: lumBuffer,
      ContentType: 'image/jpeg',
    }));
  }

  return {
    name: targetName,
    type: 'PLANAR',
    imagePath: r2Url(lumKey),
    luminancePath: lumKey,
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


