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

// Prepare 8th Wall target from cropped image buffer and upload luminance to R2
async function prepareTarget(imageBuffer, projectId) {
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

  const targetData = {
    name: 'target0',
    type: 'PLANAR',
    imagePath: r2Url(lumKey),
    metadata: {
      width: W,
      height: H
    },
    properties: {
      left: 0,
      top: 0,
      width: W,
      height: H,
      originalWidth: W,
      originalHeight: H,
      isRotated: false
    }
  };

  return targetData;
}

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: '150mb' }));

// Route root / to landing.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'landing.html'));
});

// Route /landing to landing.html
app.get('/landing', (req, res) => {
  res.sendFile(path.join(__dirname, 'landing.html'));
});

app.use(express.static(__dirname, { index: false }));

// Explicit logo route with correct image/svg+xml header
app.get('/assets/logo.svg', (req, res) => {
  const logoPath = path.join(__dirname, 'assets', 'logo.svg');
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(logoPath);
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
    return res.status(403).send(`<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:60px 20px;background:#090d16;color:#fff">
      <div style="max-width:400px;margin:0 auto;background:#162032;padding:32px 24px;border-radius:16px;border:1px solid rgba(255,255,255,0.1);box-shadow:0 10px 30px rgba(0,0,0,0.5)">
        <div style="font-size:44px;margin-bottom:12px">⏰</div>
        <h2 style="color:#f59e0b;margin:0 0 10px;font-size:22px;font-weight:700">Experience Expired</h2>
        <p style="color:#94a3b8;font-size:14px;line-height:1.6">This AR experience has passed its expiration date.</p>
      </div></body></html>`);
  }

  const td = (typeof project.target_data === 'object' && project.target_data) ? { ...project.target_data } : {};
  const maxScans = project.max_scans || td._max_scans || null;
  const currentViews = project.views_count || td._views_count || 0;

  if (maxScans && currentViews >= maxScans) {
    return res.status(403).send(`<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:60px 20px;background:#090d16;color:#fff">
      <div style="max-width:400px;margin:0 auto;background:#162032;padding:32px 24px;border-radius:16px;border:1px solid rgba(255,255,255,0.1);box-shadow:0 10px 30px rgba(0,0,0,0.5)">
        <div style="font-size:44px;margin-bottom:12px">🔒</div>
        <h2 style="color:#ef4444;margin:0 0 10px;font-size:22px;font-weight:700">Scan Limit Reached</h2>
        <p style="color:#94a3b8;font-size:14px;line-height:1.6">This AR experience has reached its limit of <strong>${maxScans} scans</strong>.</p>
      </div></body></html>`);
  }

  const targetData = project.target_data;
  if (!targetData) return res.status(404).send('<h2>Target not ready. Please re-create the project.</h2>');

  // Increment view/scan count asynchronously in DB
  const lastScanned = new Date().toISOString();
  td._views_count = currentViews + 1;
  td._last_scanned_at = lastScanned;
  supabase.from('projects')
    .update({ target_data: td })
    .eq('id', id)
    .then()
    .catch(() => {});



  const videoUrl = project.video_path.startsWith('http') ? project.video_path : r2Url(project.video_path);
  const props = (targetData && targetData.properties) || {};
  const tW = props.width || 640;
  const tH = props.height || 640;
  const tAspect = tW / tH;
  const planeW = tAspect >= 1 ? 1 : Number(tAspect.toFixed(4));
  const planeH = tAspect >= 1 ? Number((1 / tAspect).toFixed(4)) : 1;

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
    html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; touch-action:none; background:#000; }
    .a-enter-vr, .a-enter-vr-button { display:none !important; }
    
    /* Remove and suppress all 8th Wall branding & Powered-by logos */
    .poweredby,
    .powered-by,
    .poweredby-8thwall,
    .xrextras-powered-by,
    .xrextras-loading-footer,
    .loading-footer,
    #poweredBy8thWall,
    #poweredby,
    #loading-footer,
    img[src*="powered-by"],
    img[src*="8thwall"],
    [id*="poweredBy" i],
    [class*="poweredBy" i],
    [class*="powered-by" i],
    .xrextras-loading-footer img,
    .loading-footer img {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      width: 0 !important;
      height: 0 !important;
      pointer-events: none !important;
      position: absolute !important;
      left: -9999px !important;
    }
    
    /* Elegant Holographic Watermark */
    #ar-watermark {
      position: fixed;
      top: 16px;
      left: 16px;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(9, 13, 22, 0.75);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      padding: 6px 14px 6px 8px;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      pointer-events: none;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    
    #ar-watermark img {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      display: block;
    }
    
    #ar-watermark span {
      color: #f8fafc;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    
    #ar-watermark span span {
      color: #38bdf8;
      font-size: 10px;
      font-weight: 800;
      margin-left: 2px;
    }
    
    /* Audio Prompt */
    #audio-prompt {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      background: rgba(9, 13, 22, 0.88);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: #ffffff;
      padding: 10px 20px;
      border-radius: 9999px;
      border: 1px solid rgba(59, 130, 246, 0.5);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      display: none;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      animation: pulsePrompt 2s infinite ease-in-out;
    }
    
    @keyframes pulsePrompt {
      0%, 100% { transform: translateX(-50%) scale(1); }
      50% { transform: translateX(-50%) scale(1.04); }
    }
  </style>
</head>
<body>
  <!-- Watermark Badge -->
  <div id="ar-watermark">
    <img src="/assets/logo.svg" alt="Logo" />
    <span>Kipakosa<span>AR</span></span>
  </div>

  <!-- Audio Tap Prompt -->
  <div id="audio-prompt">
    <span>🔊</span> <span>Tap screen for sound</span>
  </div>

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
    var audioPrompt = document.getElementById('audio-prompt');
    
    video.addEventListener('loadedmetadata', function() {
      var tW = ${tW};
      var tH = ${tH};
      var tAspect = tW / tH;
      var vW = video.videoWidth;
      var vH = video.videoHeight;
      var vAspect = (vW && vH) ? (vW / vH) : tAspect;

      // Plane size matches target aspect ratio
      if (tAspect >= 1) {
        plane.setAttribute('width', 1);
        plane.setAttribute('height', (1 / tAspect).toFixed(4));
      } else {
        plane.setAttribute('width', tAspect.toFixed(4));
        plane.setAttribute('height', 1);
      }

      // UV texture mapping: auto-crop video to cover target plane edge-to-edge without letterboxing or stretching
      if (vAspect > tAspect) {
        // Video is wider than target: crop left and right edges
        var repeatX = tAspect / vAspect;
        var offsetX = (1 - repeatX) / 2;
        plane.setAttribute('material', 'repeat', repeatX.toFixed(4) + ' 1');
        plane.setAttribute('material', 'offset', offsetX.toFixed(4) + ' 0');
      } else if (vAspect < tAspect) {
        // Video is taller than target: crop top and bottom edges
        var repeatY = vAspect / tAspect;
        var offsetY = (1 - repeatY) / 2;
        plane.setAttribute('material', 'repeat', '1 ' + repeatY.toFixed(4));
        plane.setAttribute('material', 'offset', '0 ' + offsetY.toFixed(4));
      } else {
        plane.setAttribute('material', 'repeat', '1 1');
        plane.setAttribute('material', 'offset', '0 0');
      }
    });
    
    var sceneEl = document.querySelector('a-scene');
    sceneEl.addEventListener('xrimagefound', function(ev) {
      if (ev.detail.name !== 'target0') return;
      video.muted = false;
      video.play().catch(function() {
        video.muted = true;
        video.play().catch(function(){});
        audioPrompt.style.display = 'flex';
      });
    });
    
    sceneEl.addEventListener('xrimagelost', function(ev) {
      if (ev.detail.name !== 'target0') return;
      video.pause();
      audioPrompt.style.display = 'none';
    });
    
    function unmuteUser() {
      video.muted = false;
      video.play().catch(function(){});
      audioPrompt.style.display = 'none';
    }
    
    document.addEventListener('touchstart', unmuteUser, { passive: true });
    document.addEventListener('click', unmuteUser);
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
  const td = (typeof row.target_data === 'object' && row.target_data) ? row.target_data : {};
  const viewsCount = row.views_count || td._views_count || 0;
  const maxScans = row.max_scans || td._max_scans || null;
  const lastScannedAt = row.last_scanned_at || td._last_scanned_at || null;
  return {
    id: row.id,
    name: row.name,
    client: row.client || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    created_at: row.created_at,
    expiresAt: row.expires_at,
    expires_at: row.expires_at,
    maxScans,
    max_scans: maxScans,
    imagePath,
    image_path: imagePath,
    videoPath,
    video_path: videoPath,
    imageUrl,
    videoUrl,
    viewsCount,
    views_count: viewsCount,
    lastScannedAt,
    last_scanned_at: lastScannedAt,
    targetData: td,
    target_data: td
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
    const { id, name, client, notes, expiresAt, maxScans, imagePath, videoPath, imageBase64, videoBase64 } = req.body;
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
    if (maxScans) {
      targetData._max_scans = Number(maxScans);
    }

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
  const { name, client, notes, expiresAt, maxScans } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (client !== undefined) updates.client = client;
  if (notes !== undefined) updates.notes = notes;
  if (expiresAt !== undefined) updates.expires_at = expiresAt;

  if (maxScans !== undefined) {
    const { data: existing } = await supabase.from('projects').select('target_data').eq('id', id).single();
    const td = (typeof existing?.target_data === 'object' && existing?.target_data) ? { ...existing.target_data } : {};
    td._max_scans = maxScans ? Number(maxScans) : null;
    updates.target_data = td;
  }

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

