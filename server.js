import 'dotenv/config';
import express from 'express';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const app = express();
const PORT = process.env.PORT || 3000;

// ── Supabase database client ──────────────────────────────────────────────────
const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_SECRET = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET);

// ── Cloudflare R2 client (S3-compatible) ───────────────────────────────────────
const R2_ACCOUNT_ID   = process.env.R2_ACCOUNT_ID   || 'f7baea90c7809632483abe5522780560';
const R2_ACCESS_KEY   = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_KEY   = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET       = process.env.R2_BUCKET        || 'kipakosa-videos';
const R2_PUBLIC_URL   = process.env.R2_PUBLIC_URL    || 'https://pub-f2ad2c43aa344d4bb911e991b04b1fbd.r2.dev';

let r2 = null;
if (R2_ACCESS_KEY && R2_SECRET_KEY) {
  r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
  });
}

const LUM_W = 480;
const LUM_H = 640;

function r2Url(key) {
  return `${R2_PUBLIC_URL}/${key}`;
}

// Prepare 8th Wall target from image buffer and upload luminance to R2
async function prepareTarget(imageBuffer, projectId) {
  const meta = await sharp(imageBuffer).metadata();
  const W = meta.width, H = meta.height;
  const targetAspect = LUM_W / LUM_H; // 0.75
  const srcAspect = W / H;

  let left, top, cw, ch;
  if (srcAspect >= targetAspect) {
    cw = Math.round(H * targetAspect); ch = H;
    left = Math.floor((W - cw) / 2);  top = 0;
  } else {
    cw = W; ch = Math.round(W / targetAspect);
    left = 0; top = Math.floor((H - ch) / 2);
  }

  const lumBuffer = await sharp(imageBuffer)
    .extract({ left, top, width: cw, height: ch })
    .resize(LUM_W, LUM_H)
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

  const targetData = {
    name: 'target0',
    type: 'PLANAR',
    imagePath: r2Url(lumKey),
    metadata: {},
    properties: { left, top, width: cw, height: ch, originalWidth: W, originalHeight: H, isRotated: false }
  };

  return targetData;
}

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: '150mb' }));
app.use(express.static(__dirname));

// Route root / to index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// ── Presign endpoint for direct client uploads to R2 ─────────────────────────
app.get('/api/presign', async (req, res) => {
  const { key, type } = req.query;
  if (!key) return res.status(400).json({ error: 'Missing key' });
  if (!r2)  return res.status(503).json({ error: 'R2 not configured' });
  try {
    const cmd = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: type || 'application/octet-stream' });
    const url = await getSignedUrl(r2, cmd, { expiresIn: 3600 });
    res.json({ url, publicUrl: r2Url(key) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Config endpoint ──────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    r2PublicUrl: R2_PUBLIC_URL,
    hasR2: !!r2
  });
});

// ── Server-rendered AR viewer ─────────────────────────────────────────────────
app.get('/ar', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).send('<h2>Missing ?id= parameter</h2>');

  const { data: project, error } = await supabase
    .from('projects').select('*').eq('id', id).single();

  if (error || !project) return res.status(404).send('<h2>Project not found</h2>');

  if (project.expires_at && new Date(project.expires_at) < new Date()) {
    return res.status(403).send(`<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:60px;background:#111;color:#fff">
      <h2 style="color:#ff9800">Experience Expired</h2>
      <p>This AR experience has expired.</p></body></html>`);
  }

  const targetData = project.target_data;
  if (!targetData) return res.status(404).send('<h2>Target not ready. Please re-create the project.</h2>');

  const videoUrl = project.video_path.startsWith('http') ? project.video_path : r2Url(project.video_path);
  const planeW = 0.75, planeH = 1.3333; // JS adjusts after video loads

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>${project.name} — Kipakosa AR</title>
  <script crossorigin="anonymous" src="/external/8frame-1.5.0.min.js"><\/script>

  <script src="/external/xr/xr.js" async crossorigin="anonymous" data-preload-chunks="slam"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/@8thwall/xrextras@1/dist/xrextras.js" crossorigin="anonymous"><\/script>
  <style>
    html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; touch-action:none; }
    .a-enter-vr, .a-enter-vr-button { display:none !important; }
  </style>
</head>
<body>
  <script>
    var targetData = ${JSON.stringify(targetData)};
    var onxrloaded = function() {
      XR8.XrController.configure({ imageTargetData: [targetData] });
    };
    window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded);
  <\/script>

  <a-scene xrextras-loading xrextras-runtime-error
    renderer="colorManagement:true"
    xrweb="allowedDevices: any; disableWorldTracking: true; disableDefaultEnvironment: true">
    <a-assets>
      <video id="ar-video" src="${videoUrl}"
        preload="auto" loop playsinline webkit-playsinline crossorigin="anonymous" muted>
      </video>
    </a-assets>
    <a-camera position="0 0 0"></a-camera>
    <xrextras-named-image-target name="target0">
      <a-plane id="ar-plane" width="${planeW}" height="${planeH}" position="0 0 0.01"
        material="src: #ar-video; transparent: true; alphaTest: 0.01; shader: flat; side: double; repeat: 1 1; offset: 0 0">
      </a-plane>
    </xrextras-named-image-target>
  </a-scene>

  <script>
    var video = document.getElementById('ar-video');
    var plane = document.getElementById('ar-plane');
    video.addEventListener('loadedmetadata', function() {
      var a = video.videoWidth / video.videoHeight;
      if (a >= 0.75) { plane.setAttribute('width', a);    plane.setAttribute('height', 1); }
      else           { plane.setAttribute('width', 0.75); plane.setAttribute('height', (0.75/a).toFixed(4)); }
    });
    var sceneEl = document.querySelector('a-scene');
    sceneEl.addEventListener('xrimagefound', function(ev) {
      if (ev.detail.name !== 'target0') return;
      video.muted = false;
      video.play().catch(function() { video.muted = true; video.play().catch(function(){}); });
    });
    sceneEl.addEventListener('xrimagelost', function(ev) {
      if (ev.detail.name !== 'target0') return;
      video.pause();
    });
    document.addEventListener('touchstart', function() {
      if (video.paused) video.play().catch(function(){});
    }, { once: true });
  <\/script>
</body>
</html>`);
});

function formatProject(row) {
  if (!row) return null;
  const imagePath = row.image_path || '';
  const videoPath = row.video_path || '';
  const imageUrl = imagePath ? (imagePath.startsWith('http') ? imagePath : r2Url(imagePath)) : '';
  const videoUrl = videoPath ? (videoPath.startsWith('http') ? videoPath : r2Url(videoPath)) : '';
  return {
    id: row.id,
    name: row.name,
    client: row.client || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    created_at: row.created_at,
    expiresAt: row.expires_at,
    expires_at: row.expires_at,
    imagePath,
    image_path: imagePath,
    videoPath,
    video_path: videoPath,
    imageUrl,
    videoUrl,
    targetData: row.target_data,
    target_data: row.target_data
  };
}

// ── Projects API ──────────────────────────────────────────────────────────────
app.get('/api/projects', async (req, res) => {
  const { data, error } = await supabase
    .from('projects').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(formatProject));
});

app.get('/api/projects/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('projects').select('*').eq('id', req.params.id).single();
  if (error || !data) return res.status(404).json({ error: 'Not found' });
  res.json(formatProject(data));
});


app.post('/api/projects', async (req, res) => {
  try {
    const { id, name, client, notes, expiresAt, imagePath, videoPath, imageBase64, videoBase64 } = req.body;
    if (!id || !name) return res.status(400).json({ error: 'Missing required fields' });

    let resolvedImagePath = imagePath || `${id}/original.jpg`;
    let resolvedVideoPath = videoPath || `${id}/video.mp4`;

    // Local dev fallback if base64 sent
    if (imageBase64 && r2) {
      const buf = Buffer.from(imageBase64.split(',')[1] || imageBase64, 'base64');
      await r2.send(new PutObjectCommand({
        Bucket: R2_BUCKET, Key: resolvedImagePath, Body: buf, ContentType: 'image/jpeg'
      }));
    }

    if (videoBase64 && r2) {
      const buf = Buffer.from(videoBase64.split(',')[1] || videoBase64, 'base64');
      await r2.send(new PutObjectCommand({
        Bucket: R2_BUCKET, Key: resolvedVideoPath, Body: buf, ContentType: 'video/mp4'
      }));
    }

    // Download image from R2 to run sharp target compilation
    const imgUrl = r2Url(resolvedImagePath);
    const imgFetch = await fetch(imgUrl);
    if (!imgFetch.ok) throw new Error('Cannot fetch image from R2: ' + imgFetch.statusText);
    const imgBuffer = Buffer.from(await imgFetch.arrayBuffer());

    const targetData = await prepareTarget(imgBuffer, id);

    // Save metadata to Supabase DB
    const { error: dbErr } = await supabase.from('projects').insert({
      id, name, client, notes,
      expires_at: expiresAt || null,
      image_path: resolvedImagePath,
      video_path: resolvedVideoPath,
      target_data: targetData,
    });
    if (dbErr) throw new Error('DB insert failed: ' + dbErr.message);

    res.status(201).json({ id, name, targetData });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  const { name, client, notes, expiresAt } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (client !== undefined) updates.client = client;
  if (notes !== undefined) updates.notes = notes;
  if (expiresAt !== undefined) updates.expires_at = expiresAt;

  const { data, error } = await supabase
    .from('projects').update(updates).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(formatProject(data));
});

app.delete('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});


app.listen(PORT, () => {
  console.log(`Drishya AR running at http://localhost:${PORT}`);
});

export default app;

