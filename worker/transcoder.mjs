// Kipakosa transcode worker.
//
// Pulls the raw upload from R2, produces a web-optimised, fast-start MP4 with
// ffmpeg, uploads it to R2 and flips the project's target_data to point at it.
// Runs on the Oracle VM under pm2.
//
// Job state lives in target_data.transcode_status:
//   queued -> processing -> ready | error
//
// Usage: node worker/transcoder.mjs            (poll forever)
//        node worker/transcoder.mjs --once     (process queued jobs once)
//        node worker/transcoder.mjs --project <id>  (force one project)

import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, weld, flatten } from '@gltf-transform/functions';
import sharp from 'sharp';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

if (!SUPABASE_URL || !SUPABASE_KEY || !R2_ACCOUNT_ID || !R2_BUCKET || !R2_PUBLIC_URL) {
  console.error('Missing Supabase/R2 env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const POLL_MS = Number(process.env.TRANSCODE_POLL_MS || 15000);
const MAX_SIDE = Number(process.env.TRANSCODE_MAX_SIDE || 1280);
const MAXRATE = process.env.TRANSCODE_MAXRATE || '1800k';
const BUFSIZE = process.env.TRANSCODE_BUFSIZE || '3600k';
const CRF = process.env.TRANSCODE_CRF || '23';
const MODEL_MAX_TEX = Number(process.env.MODEL_MAX_TEXTURE || 1024);
const MODEL_JPEG_Q = Number(process.env.MODEL_JPEG_QUALITY || 80);
const STUCK_MS = 10 * 60 * 1000;
const ASSET_CACHE = 'public, max-age=3600, stale-while-revalidate=86400';

const r2Url = (key) => `${R2_PUBLIC_URL}/${key}`;

function log(...a) { console.log(new Date().toISOString(), ...a); }

async function getToFile(key, dest) {
  const res = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(dest);
    res.Body.pipe(ws);
    res.Body.on('error', reject);
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
}

async function getToBuffer(key) {
  const res = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  const chunks = [];
  for await (const c of res.Body) chunks.push(c);
  return Buffer.concat(chunks);
}

async function putFromFile(key, src, contentType) {
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: fs.createReadStream(src), ContentType: contentType, CacheControl: ASSET_CACHE,
  }));
}

// Optimise a .glb: shrink + re-encode textures (the dominant cost), then
// dedup/weld/prune/flatten. No runtime mesh decoder needed.
async function optimizeModel(sourceKey, outKey) {
  const buf = await getToBuffer(sourceKey);
  const magic = buf.subarray(0, 4).toString('ascii');
  if (magic !== 'glTF') throw new Error('not a valid GLB (magic=' + JSON.stringify(magic) + ')');

  const io = new NodeIO();
  const doc = await io.readBinary(new Uint8Array(buf));
  const root = doc.getRoot();

  let resized = 0;
  for (const tex of root.listTextures()) {
    const img = tex.getImage();
    if (!img) continue;
    try {
      const out = await sharp(Buffer.from(img))
        .resize(MODEL_MAX_TEX, MODEL_MAX_TEX, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: MODEL_JPEG_Q })
        .toBuffer();
      tex.setImage(out).setMimeType('image/jpeg');
      resized++;
    } catch { /* keep original texture on failure */ }
  }

  await doc.transform(dedup(), weld(), prune(), flatten());
  const glb = Buffer.from(await io.writeBinary(doc));

  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: outKey, Body: glb, ContentType: 'model/gltf-binary', CacheControl: ASSET_CACHE,
  }));
  return { bytes: glb.byteLength, textures: resized, url: r2Url(outKey) };
}

function runFfmpeg(input, output) {
  const filter = `scale=${MAX_SIDE}:${MAX_SIDE}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
  const args = [
    '-y', '-i', input,
    '-map', '0:v:0', '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', CRF,
    '-maxrate', MAXRATE, '-bufsize', BUFSIZE,
    '-vf', filter,
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', '-pix_fmt', 'yuv420p',
    '-threads', '1',
    output,
  ];
  // nice so transcoding never starves the AR server (Linux only)
  return new Promise((resolve, reject) => {
    const useNice = process.platform !== 'win32';
    const p = spawn(useNice ? 'nice' : 'ffmpeg', useNice ? ['-n', '19', 'ffmpeg', ...args] : args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err += d.toString(); if (err.length > 8000) err = err.slice(-8000); });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code + ': ' + err.slice(-500))));
  });
}

function probeDuration(file) {
  return new Promise((resolve) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
    let out = '';
    p.stdout.on('data', d => out += d.toString());
    p.on('close', () => resolve(Number(out.trim()) || null));
    p.on('error', () => resolve(null));
  });
}

async function transcode(sourceKey, outKey) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kip-'));
  const inFile = path.join(tmp, 'in' + path.extname(sourceKey || '.mp4') || '.mp4');
  const outFile = path.join(tmp, 'out.mp4');
  try {
    await getToFile(sourceKey, inFile);
    await runFfmpeg(inFile, outFile);
    const bytes = fs.statSync(outFile).size;
    const duration = await probeDuration(outFile);
    await putFromFile(outKey, outFile, 'video/mp4');
    return { bytes, duration, url: r2Url(outKey) };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

async function markProject(id, patch) {
  const { data } = await supabase.from('projects').select('target_data').eq('id', id).single();
  const td = { ...((data && data.target_data) || {}), ...patch };
  await supabase.from('projects').update({ target_data: td }).eq('id', id);
}

async function processProject(p) {
  const id = p.id;
  const td = p.target_data || {};
  const is3d = td.overlay_type === '3d' || !!td.model_path;
  await markProject(id, { transcode_status: 'processing', transcode_error: null });

  if (is3d) {
    const sourceKey = td.model_path || `${id}/model.glb`;
    log('project', id.slice(0, 8), p.name, '-> optimize 3D', sourceKey);
    try {
      const out = await optimizeModel(sourceKey, `${id}/optimized.glb`);
      await markProject(id, {
        optimized_model_path: `${id}/optimized.glb`,
        optimized_model_url: out.url,
        transcode_status: 'ready',
        transcode_error: null,
        model_bytes: out.bytes,
      });
      log('project', id.slice(0, 8), '3D ready', Math.round(out.bytes / 1024) + 'KB');
    } catch (err) {
      log('project', id.slice(0, 8), '3D ERROR', err.message);
      await markProject(id, { transcode_status: 'error', transcode_error: err.message });
    }
    return;
  }

  const sourceKey = td.video_path || p.video_path || `${id}/video.mp4`;
  log('project', id.slice(0, 8), p.name, '-> transcode', sourceKey);
  try {
    const out = await transcode(sourceKey, `${id}/optimized.mp4`);
    await markProject(id, {
      optimized_video_path: `${id}/optimized.mp4`,
      optimized_video_url: out.url,
      transcode_status: 'ready',
      transcode_error: null,
      video_bytes: out.bytes,
      video_duration: out.duration,
    });
    log('project', id.slice(0, 8), 'ready', Math.round(out.bytes / 1024) + 'KB');
  } catch (err) {
    log('project', id.slice(0, 8), 'ERROR', err.message);
    await markProject(id, { transcode_status: 'error', transcode_error: err.message });
  }
}

async function processMagazineTarget(mag, idx) {
  const t = mag.targets[idx];
  const td = t.target_data || {};
  const is3d = ((t.overlay && t.overlay.type) || td.overlay_type) === '3d' || !!td.model_path;
  const sourceKey = is3d
    ? (td.model_path || (t.overlay && t.overlay.path) || `${mag.id}/target-${idx}/model.glb`)
    : (td.video_path || t.overlay_video_path || `${mag.id}/target-${idx}/video.mp4`);
  const outKey = is3d ? `${mag.id}/target-${idx}/optimized.glb` : `${mag.id}/target-${idx}/optimized.mp4`;
  log('magazine', mag.id.slice(0, 8), 'target', idx, '->', is3d ? 'optimize 3D' : 'transcode');
  const setStatus = async (status, extra = {}) => {
    const targets = mag.targets.map(x => ({ ...x }));
    targets[idx] = { ...targets[idx], target_data: { ...(targets[idx].target_data || {}), transcode_status: status, ...extra } };
    await supabase.from('magazines').update({ targets }).eq('id', mag.id);
  };
  await setStatus('processing', { transcode_error: null });
  try {
    if (is3d) {
      const out = await optimizeModel(sourceKey, outKey);
      await setStatus('ready', {
        optimized_model_path: outKey,
        optimized_model_url: out.url,
        transcode_error: null,
        model_bytes: out.bytes,
      });
      log('magazine', mag.id.slice(0, 8), 'target', idx, '3D ready');
    } else {
      const out = await transcode(sourceKey, outKey);
      await setStatus('ready', {
        optimized_video_path: outKey,
        optimized_video_url: out.url,
        transcode_error: null,
        video_bytes: out.bytes,
        video_duration: out.duration,
      });
      log('magazine', mag.id.slice(0, 8), 'target', idx, 'ready');
    }
  } catch (err) {
    log('magazine', mag.id.slice(0, 8), 'target', idx, 'ERROR', err.message);
    await setStatus('error', { transcode_error: err.message });
  }
}

async function resetStuck() {
  const cutoff = new Date(Date.now() - STUCK_MS).toISOString();
  const { data } = await supabase
    .from('projects')
    .select('id,target_data')
    .filter('target_data->>transcode_status', 'eq', 'processing');
  for (const p of data || []) {
    const updated = p.target_data && p.target_data.transcode_updated_at;
    if (!updated || updated < cutoff) {
      await markProject(p.id, { transcode_status: 'queued' });
      log('requeued stuck project', p.id.slice(0, 8));
    }
  }
}

async function tick() {
  const { data: projects } = await supabase
    .from('projects')
    .select('id,name,video_path,target_data')
    .filter('target_data->>transcode_status', 'eq', 'queued')
    .limit(5);
  for (const p of projects || []) await processProject(p);

  const { data: mags } = await supabase.from('magazines').select('id,targets');
  for (const m of mags || []) {
    const targets = m.targets || [];
    for (let i = 0; i < targets.length; i++) {
      const st = (targets[i].target_data || {}).transcode_status;
      if (st === 'queued') await processMagazineTarget(m, i);
    }
  }
}

const forceProject = process.argv.includes('--project') ? process.argv[process.argv.indexOf('--project') + 1] : null;

if (forceProject) {
  const { data: p } = await supabase.from('projects').select('id,name,video_path,target_data').eq('id', forceProject).single();
  if (!p) { console.error('project not found'); process.exit(1); }
  await processProject(p);
  process.exit(0);
}

if (process.argv.includes('--once')) {
  await resetStuck();
  await tick();
  process.exit(0);
}

log('transcoder worker started (poll ' + POLL_MS + 'ms, maxSide ' + MAX_SIDE + ')');
await resetStuck().catch(() => {});
while (true) {
  try { await tick(); } catch (e) { log('tick error', e.message); }
  await new Promise(r => setTimeout(r, POLL_MS));
}
