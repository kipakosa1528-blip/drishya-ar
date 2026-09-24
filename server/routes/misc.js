// Misc API routes: R2 presigned uploads (admin only) and public config.

import os from 'node:os';
import fs from 'node:fs';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { supabase, getR2, R2_BUCKET, r2Url, ADMIN_EMAIL } from '../lib/clients.js';
import { rateLimit } from '../lib/security.js';

// ── Machine stats (CPU / RAM / disk) ─────────────────────────────────────────
let _lastCpu = null;
function cpuPercent() {
  const now = os.cpus();
  if (!_lastCpu || _lastCpu.length !== now.length) { _lastCpu = now; return 0; }
  let idle = 0, total = 0;
  for (let i = 0; i < now.length; i++) {
    const a = now[i].times, b = _lastCpu[i].times;
    idle += a.idle - b.idle;
    total += (a.user + a.nice + a.sys + a.idle + a.irq) - (b.user + b.nice + b.sys + b.idle + b.irq);
  }
  _lastCpu = now;
  return total > 0 ? Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100))) : 0;
}

export function localSystemStats() {
  const cpus = os.cpus();
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  let diskTotal = null, diskFree = null;
  try {
    const s = fs.statfsSync('/');
    diskTotal = s.blocks * s.bsize;
    diskFree = s.bfree * s.bsize;
  } catch { /* unsupported fs */ }
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpuCount: cpus.length,
    cpuModel: cpus[0] ? cpus[0].model.trim() : '',
    cpuPct: cpuPercent(),
    loadAvg: os.loadavg(),
    memTotal,
    memFree,
    memUsed: memTotal - memFree,
    diskTotal,
    diskFree,
    diskUsed: diskTotal != null && diskFree != null ? diskTotal - diskFree : null,
    uptimeSec: os.uptime(),
    ts: Date.now(),
  };
}


// Keys are locked to <uuid>/(original.jpg|luminance.jpg|video.mp4|model.glb) or
// (magazines/)?<uuid>(/targets/<n>)?/(original.jpg|luminance.jpg|video.mp4|overlay.mp4|overlay.jpg|model.glb)
// so a signed URL can never be minted for an arbitrary bucket path.
const PRESIGN_KEY_RE = /^(magazines\/)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/targets\/\d+)?\/(original\.jpg|luminance\.jpg|video\.mp4|overlay\.mp4|overlay\.jpg|model\.glb)$/;

export function registerMiscRoutes(app, { requireAuth }) {
  app.get('/api/presign', requireAuth, rateLimit({ max: 1000 }), async (req, res) => {
    const { key, type } = req.query;
    const r2 = getR2();
    if (!key) return res.status(400).json({ error: 'Missing key' });
    if (!PRESIGN_KEY_RE.test(key)) return res.status(400).json({ error: 'Invalid key' });
    if (!r2)  return res.status(503).json({ error: 'R2 not configured' });
    try {
      const cmd = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: type || 'application/octet-stream' });
      const url = await getSignedUrl(r2, cmd, { expiresIn: 600 });
      res.json({ url, publicUrl: r2Url(key) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Batch presign endpoint for fast multi-target uploads
  app.post('/api/presign-batch', requireAuth, rateLimit({ max: 200 }), async (req, res) => {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing or empty items array' });
    }
    const r2 = getR2();
    if (!r2) return res.status(503).json({ error: 'R2 not configured' });

    try {
      const results = await Promise.all(
        items.map(async item => {
          const { key, type } = item;
          if (!key || !PRESIGN_KEY_RE.test(key)) {
            return { key, error: 'Invalid key' };
          }
          const cmd = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: type || 'application/octet-stream' });
          const url = await getSignedUrl(r2, cmd, { expiresIn: 600 });
          return { key, url, publicUrl: r2Url(key) };
        })
      );
      res.json({ items: results });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public config for browser clients. Only PUBLIC values belong here
  // (the anon key is designed to be exposed; the service key never is).
  app.get('/api/config', (req, res) => {
    res.json({
      r2PublicUrl: process.env.R2_PUBLIC_URL,
      hasR2: !!getR2(),
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
      adminEmail: ADMIN_EMAIL
    });
  });

  // Database Heartbeat & Health Check Endpoint (Prevents Supabase auto-pausing)
  app.get('/api/health', async (req, res) => {
    try {
      const start = Date.now();
      // Lightweight query that exercises Supabase DB without loading heavy payloads
      const { count, error } = await supabase
        .from('projects')
        .select('id', { count: 'exact', head: true });

      if (error) {
        return res.status(500).json({ status: 'error', error: error.message, time: new Date().toISOString() });
      }

      res.json({
        status: 'healthy',
        heartbeat: 'active',
        responseTimeMs: Date.now() - start,
        database: 'connected',
        projectsCount: count || 0,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      res.status(500).json({ status: 'error', error: err.message, time: new Date().toISOString() });
    }
  });

  // Local machine stats. Runs on the VM (nginx proxies :3000) so the Vercel
  // /api/vm-stats route can read the VM's real CPU/RAM/disk server-side.
  app.get('/api/system-stats', (req, res) => {
    res.json(localSystemStats());
  });

  // Aggregated VM health for the dashboard: VM stats (proxied) + transcode queue.
  app.get('/api/vm-stats', requireAuth, async (req, res) => {
    const vmUrl = process.env.VM_STATS_URL;
    let vm = null;
    let online = false;
    if (vmUrl) {
      try {
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('vm timeout')), 4000));
        const r = await Promise.race([fetch(vmUrl.replace(/\/+$/, '') + '/api/system-stats'), timeout]);
        if (r.ok) { vm = await r.json(); online = true; }
      } catch { online = false; }
    } else {
      vm = { ...localSystemStats(), isLocal: true };
      online = true;
    }

    const queue = { queued: 0, processing: 0, ready: 0, error: 0, missing: 0, optimized: 0, total: 0, projects: 0, magazineTargets: 0 };
    try {
      const { data: projs } = await supabase.from('projects').select('video_path,target_data');
      for (const row of projs || []) {
        const td = row.target_data || {};
        const type = td.overlay_type || (row.video_path ? 'video' : null);
        if (type !== 'video') continue;
        queue.total++; queue.projects++;
        const st = td.transcode_status || (td.optimized_video_path ? 'ready' : 'missing');
        if (queue[st] != null) queue[st]++;
        if (td.optimized_video_path) queue.optimized++;
      }
      const { data: mags } = await supabase.from('magazines').select('targets');
      for (const m of mags || []) {
        for (const t of (m.targets || [])) {
          const type = (t.overlay && t.overlay.type) || (t.target_data && t.target_data.overlay_type);
          if (type !== 'video') continue;
          const td = t.target_data || {};
          queue.total++; queue.magazineTargets++;
          const st = td.transcode_status || (td.optimized_video_path ? 'ready' : 'missing');
          if (queue[st] != null) queue[st]++;
          if (td.optimized_video_path) queue.optimized++;
        }
      }
    } catch { /* db best-effort */ }

    res.json({ online, vm, queue, at: new Date().toISOString() });
  });
}

