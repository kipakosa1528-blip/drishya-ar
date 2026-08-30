// Server-rendered public AR viewer route: /ar?id=<projectId>
// Public by design — visitors scan a printed QR and land here.

import { supabase, r2Url } from '../lib/clients.js';
import { esc } from '../lib/security.js';
import { renderArPage, renderMessagePage } from '../views/ar-viewer.js';
import { renderMagazineArPage } from '../views/magazine-viewer.js';

// ── In-memory cache ────────────────────────────────────────────────────────
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
    const firstKey = _cache.keys().next().value;
    _cache.delete(firstKey);
  }
  _cache.set(id, { data, ts: Date.now() });
}

export function cacheBust(id) {
  _cache.delete(id);
}

export function registerArRoute(app) {
  const arHandler = async (req, res) => {
    const id = req.query.id || req.query.magId;
    if (!id) return res.status(400).send('<h2>Missing ?id= parameter</h2>');

    const isExplicitMag = req.path.startsWith('/magAr') || req.path.startsWith('/magar') || !!req.query.magId;

    // If explicit magazine route or param
    if (isExplicitMag) {
      return handleMagazineAr(id, res);
    }

    // Try single project first
    let project = cacheGet(id);
    let error = null;
    if (!project) {
      const result = await supabase
        .from('projects').select('*').eq('id', id).single();
      error = result.error;
      project = result.data;
      if (!error && project) cacheSet(id, project);
    }

    // If found in projects, render single project AR
    if (project && !error) {
      return handleProjectAr(project, id, res);
    }

    // Otherwise check if this ID is a magazine
    return handleMagazineAr(id, res);
  };

  app.get('/ar', arHandler);
  app.get('/magAr', arHandler);
  app.get('/magar', arHandler);
}

async function handleProjectAr(project, id, res) {
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

  // Increment scan count safely
  Promise.resolve(supabase.rpc('increment_scan', { p_id: id })).catch(() => {
    supabase.from('projects').update({ views_count: currentViews + 1 }).eq('id', id).then(null, () => {});
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
}

async function handleMagazineAr(id, res) {
  let magazine = cacheGet('mag_' + id);
  if (!magazine) {
    const result = await supabase
      .from('magazines').select('*').eq('id', id).single();
    if (result.error || !result.data) {
      return res.status(404).send('<h2>AR Experience not found</h2>');
    }
    magazine = result.data;
    cacheSet('mag_' + id, magazine);
  }

  // Check Expiry Date
  if (magazine.expires_at && new Date(magazine.expires_at) < new Date()) {
    return res.status(403).send(renderMessagePage({
      icon: '⏰',
      color: '#f59e0b',
      title: 'Magazine Expired',
      body: 'This multi-target AR magazine experience has passed its expiration date.',
    }));
  }

  // Check Scan Limit
  const maxScans = magazine.max_scans || null;
  const currentViews = magazine.views_count || 0;

  if (maxScans && currentViews >= maxScans) {
    return res.status(403).send(renderMessagePage({
      icon: '🔒',
      color: '#ef4444',
      title: 'Scan Limit Reached',
      body: `This magazine has reached its limit of <strong>${esc(maxScans)} scans</strong>.`,
    }));
  }

  // Increment scans safely
  Promise.resolve(
    supabase.from('magazines').update({
      views_count: currentViews + 1,
      last_scanned_at: new Date().toISOString()
    }).eq('id', id)
  ).then(null, () => {});

  const targets = Array.isArray(magazine.targets) ? magazine.targets : [];
  if (targets.length === 0) {
    return res.status(404).send('<h2>No AR targets configured for this magazine.</h2>');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderMagazineArPage({ title: magazine.title, magId: magazine.id, targets }));
}
