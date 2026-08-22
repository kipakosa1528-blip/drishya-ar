// Server-rendered public AR viewer route: /ar?id=<projectId>
// Public by design — visitors scan a printed QR and land here.

import { supabase, r2Url } from '../lib/clients.js';
import { esc } from '../lib/security.js';
import { renderArPage, renderMessagePage } from '../views/ar-viewer.js';

export function registerArRoute(app) {
  app.get('/ar', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).send('<h2>Missing ?id= parameter</h2>');

    const { data: project, error } = await supabase
      .from('projects').select('*').eq('id', id).single();

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

    // Increment view/scan count atomically via RPC; falls back to the legacy
    // read-modify-write on target_data if the increment_scan RPC is not installed.
    const lastScanned = new Date().toISOString();
    let counted = false;
    try {
      const { error: rpcErr } = await supabase.rpc('increment_scan', { p_id: id });
      counted = !rpcErr;
    } catch { /* fall through to legacy path */ }
    if (!counted) {
      td._views_count = currentViews + 1;
      td._last_scanned_at = lastScanned;
      supabase.from('projects')
        .update({ target_data: td })
        .eq('id', id)
        .then()
        .catch(() => {});
    }

    const videoUrl = project.video_path.startsWith('http') ? project.video_path : r2Url(project.video_path);
    const props = (targetData && targetData.properties) || {};
    const tW = props.width || 640;
    const tH = props.height || 640;
    const tAspect = tW / tH;
    const planeW = tAspect >= 1 ? 1 : Number(tAspect.toFixed(4));
    const planeH = tAspect >= 1 ? Number((1 / tAspect).toFixed(4)) : 1;

    res.setHeader('Content-Type', 'text/html');
    res.send(renderArPage({ name: project.name, videoUrl, targetData, planeW, planeH, tW, tH }));
  });
}
