// Server-rendered public AR viewer route: /ar?id=<projectId>
// Public by design — visitors scan a printed QR and land here.

import { supabase, r2Url } from '../lib/clients.js';
import { esc } from '../lib/security.js';
import { renderArPage, renderMessagePage } from '../views/ar-viewer.js';

// ── In-memory project cache ────────────────────────────────────────────────
// Caches project DB records for 5 minutes to skip repeat Supabase selects
// on popular QR codes (e.g. an event where 100+ people scan the same code).
// Max 200 entries; evicts oldest on overflow. Per-process (Vercel warm instance).
const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function cacheGet(id) {
  const entry = _cache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(id); return null; }
  return entry.data;
}

function cacheSet(id, data) {
  if (_cache.size >= 200) {
    // Evict oldest entry (Maps preserve insertion order)
    const firstKey = _cache.keys().next().value;
    _cache.delete(firstKey);
  }
  _cache.set(id, { data, ts: Date.now() });
}

/** Call this after any project update so the next AR scan fetches fresh data. */
export function cacheBust(id) {
  _cache.delete(id);
}

export function registerArRoute(app) {
  app.get('/ar', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).send('<h2>Missing ?id= parameter</h2>');

    // Try cache first; fall back to DB on miss - saves ~180-200ms on repeat scans
    let project = cacheGet(id);
    let error = null;
    if (!project) {
      const result = await supabase
        .from('projects').select('*').eq('id', id).single();
      error = result.error;
      project = result.data;
      if (!error && project) cacheSet(id, project);
    }

    if (error || !project) return res.status(404).send('<h2>Project not found</h2>');

    if (project.expires_at && new Date(project.expires_at) < new Date()) {
      return res.status(403).send(renderMessagePage({
        icon: '⏰',
        color: '#f59e0b',
        title: 'Experience Expired',
        body: 'This AR experience has passed its expiration date.',
      }));
    }

    const td = (typeof project.target_data === 'object' && project.target_data) ? { ...project.target_data } : {};
    const maxScans = project.max_scans || td._max_scans || null;
    const currentViews = project.views_count || td._views_count || 0;

    if (maxScans && currentViews >= maxScans) {
      return res.status(403).send(renderMessagePage({
        icon: '🔒',
        color: '#ef4444',
        title: 'Scan Limit Reached',
        body: `This AR experience has reached its limit of <strong>${esc(maxScans)} scans</strong>.`,
      }));
    }

    const targetData = project.target_data;
    if (!targetData) return res.status(404).send('<h2>Target not ready. Please re-create the project.</h2>');

    // Fire-and-forget: increment scan count without blocking HTML response (~150-200ms saved).
    const lastScanned = new Date().toISOString();
    let counted = false;
    supabase.rpc('increment_scan', { p_id: id })
      .then(({ error: rpcErr }) => {
        counted = !rpcErr;
        if (!counted) {
          td._views_count = currentViews + 1;
          td._last_scanned_at = lastScanned;
          supabase.from('projects')
            .update({ target_data: td })
            .eq('id', id)
            .then()
            .catch(() => {});
        }
      })
      .catch(() => {
        td._views_count = currentViews + 1;
        td._last_scanned_at = lastScanned;
        supabase.from('projects')
          .update({ target_data: td })
          .eq('id', id)
          .then()
          .catch(() => {});
      });

    const muxPlaybackId = td.mux_playback_id || project.mux_playback_id || null;
    const muxVideoUrl = muxPlaybackId ? `https://stream.mux.com/${muxPlaybackId}/capped-1080p.mp4` : null;
    const r2VideoUrl = project.video_path.startsWith('http') ? project.video_path : r2Url(project.video_path);
    const videoUrl = muxVideoUrl || r2VideoUrl;
    const props = (targetData && targetData.properties) || {};
    const tW = props.width || 640;
    const tH = props.height || 640;
    const tAspect = tW / tH;
    const planeW = tAspect >= 1 ? 1 : Number(tAspect.toFixed(4));
    const planeH = tAspect >= 1 ? Number((1 / tAspect).toFixed(4)) : 1;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderArPage({ name: project.name, videoUrl, muxPlaybackId, r2VideoUrl, targetData, planeW, planeH, tW, tH }));
  });
}
