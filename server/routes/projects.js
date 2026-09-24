// Projects REST API.
// Reads are PUBLIC (shared links / dashboards rely on them); all writes
// require a valid Supabase Auth Bearer token.

import express from 'express';
import { PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { supabase, getR2, R2_BUCKET, r2Url, prepareTarget } from '../lib/clients.js';
import { cacheBust } from './ar.js';

const ASSET_CACHE = 'public, max-age=3600, stale-while-revalidate=86400';
const isGlb = (buf) => buf && buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === 'glTF';

/**
 * Normalize a DB row for API consumers.
 * NOTE: both camelCase and snake_case keys are emitted on purpose — the
 * admin pages and utils.js read a mix of both shapes (legacy compat).
 * @param {Record<string, unknown>} row
 */
function formatProject(row) {
  if (!row) return null;
  const imagePath = row.image_path || '';
  const videoPath = row.video_path || '';
  const imageUrl = imagePath ? (imagePath.startsWith('http') ? imagePath : r2Url(imagePath)) : '';
  const td = (typeof row.target_data === 'object' && row.target_data) ? row.target_data : {};
  const optimizedPath = td.optimized_video_path || '';
  const optimizedVideoUrl = optimizedPath ? (optimizedPath.startsWith('http') ? optimizedPath : r2Url(optimizedPath)) : '';
  const r2VideoUrl = videoPath ? (videoPath.startsWith('http') ? videoPath : r2Url(videoPath)) : '';
  // Self-hosted optimized MP4 (VM transcode) first, then the raw R2 original.
  const videoUrl = optimizedVideoUrl || r2VideoUrl || '';
  const videoBytes = td.video_bytes || null;
  const transcodeStatus = td.transcode_status || (optimizedVideoUrl ? 'ready' : (videoPath ? 'missing' : 'none'));
  const viewsCount = row.views_count || td._views_count || 0;
  const maxScans = row.max_scans || td._max_scans || null;
  const lastScannedAt = row.last_scanned_at || td._last_scanned_at || null;
  const overlayType = td.overlay_type || (row.video_path ? 'video' : 'image');
  const modelPath = td.model_path || row.model_path || '';
  const baseModelUrl = modelPath ? (modelPath.startsWith('http') ? modelPath : r2Url(modelPath)) : (td.model_url || '');
  const optimizedModelPath = td.optimized_model_path || '';
  const optimizedModelUrl = optimizedModelPath ? (optimizedModelPath.startsWith('http') ? optimizedModelPath : r2Url(optimizedModelPath)) : '';
  const modelUrl = optimizedModelUrl || baseModelUrl;
  const modelBytes = td.model_bytes || null;

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
    overlayType,
    overlay_type: overlayType,
    modelPath,
    model_path: modelPath,
    modelUrl,
    model_url: modelUrl,
    optimizedModelUrl,
    optimized_model_url: optimizedModelUrl,
    optimizedModelPath,
    optimized_model_path: optimizedModelPath,
    modelBytes,
    model_bytes: modelBytes,
    imagePath,
    image_path: imagePath,
    videoPath,
    video_path: videoPath,
    imageUrl,
    videoUrl,
    r2VideoUrl,
    r2_video_url: r2VideoUrl,
    optimizedVideoUrl,
    optimized_video_url: optimizedVideoUrl,
    optimizedPath,
    optimized_video_path: optimizedPath,
    videoBytes,
    video_bytes: videoBytes,
    transcodeStatus,
    transcode_status: transcodeStatus,
    transcodeError: td.transcode_error || null,
    transcode_error: td.transcode_error || null,
    viewsCount,
    views_count: viewsCount,
    lastScannedAt,
    last_scanned_at: lastScannedAt,
    targetData: td,
    target_data: td
  };
}

/** Delete all R2 objects under a project id prefix (best-effort). */
async function purgeProjectFiles(id) {
  const r2 = getR2();
  if (!r2) return;
  try {
    const listed = await r2.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: `${id}/` }));
    const objects = (listed.Contents || []).map(o => ({ Key: o.Key }));
    if (objects.length === 0) return;
    await r2.send(new DeleteObjectsCommand({ Bucket: R2_BUCKET, Delete: { Objects: objects } }));
  } catch (err) {
    console.error('R2 purge failed for', id, err.message);
  }
}

export function registerProjectsRoutes(app, { requireAuth }) {
  // ── Reads (public) ─────────────────────────────────────────────────────────
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

  // ── Writes (admin only) ────────────────────────────────────────────────────
  // Large body parser only for this route (base64 media fallback uploads)
  app.post('/api/projects', express.json({ limit: '150mb' }), requireAuth, async (req, res) => {
    try {
      const { id, name, client, notes, expiresAt, maxScans, overlayType, overlayFraming, imagePath, videoPath, modelPath, imageBase64, videoBase64, modelBase64 } = req.body;
      if (!id || !name) return res.status(400).json({ error: 'Missing required fields' });

      let resolvedImagePath = imagePath || `${id}/original.jpg`;
      let resolvedVideoPath = (overlayType === '3d' ? null : (videoPath || `${id}/video.mp4`));
      let resolvedModelPath = modelPath || (overlayType === '3d' ? `${id}/model.glb` : null);
      const r2 = getR2();

      // Local dev fallback if base64 sent
      if (imageBase64 && r2) {
        const buf = Buffer.from(imageBase64.split(',')[1] || imageBase64, 'base64');
        await r2.send(new PutObjectCommand({
          Bucket: R2_BUCKET, Key: resolvedImagePath, Body: buf, ContentType: 'image/jpeg'
        }));
      }

      if (videoBase64 && r2 && overlayType !== '3d') {
        const buf = Buffer.from(videoBase64.split(',')[1] || videoBase64, 'base64');
        await r2.send(new PutObjectCommand({
          Bucket: R2_BUCKET, Key: resolvedVideoPath, Body: buf, ContentType: 'video/mp4', CacheControl: ASSET_CACHE
        }));
      }

      if (modelBase64 && r2) {
        const buf = Buffer.from(modelBase64.split(',')[1] || modelBase64, 'base64');
        if (!isGlb(buf)) return res.status(400).json({ error: 'That file is not a valid 3D model (.glb / glTF)' });
        await r2.send(new PutObjectCommand({
          Bucket: R2_BUCKET, Key: resolvedModelPath, Body: buf, ContentType: 'model/gltf-binary', CacheControl: ASSET_CACHE
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

      const framing = overlayFraming || req.body.framing;
      if (framing) {
        targetData.overlay_framing = framing;
      }

      if (overlayType === '3d' || resolvedModelPath) {
        targetData.overlay_type = '3d';
        targetData.model_path = resolvedModelPath;
        targetData.model_url = r2Url(resolvedModelPath);
      } else if (resolvedVideoPath) {
        targetData.overlay_type = 'video';
        // Queue the self-hosted ffmpeg transcode (VM worker).
        targetData.video_path = resolvedVideoPath;
        targetData.transcode_status = 'queued';
        targetData.transcode_error = null;
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

  app.put('/api/projects/:id', express.json({ limit: '150mb' }), requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, client, notes, expiresAt, maxScans, overlayType, overlayFraming, imageBase64, imagePath, videoBase64, videoPath, modelBase64, modelPath } = req.body;

      const { data: existing, error: getErr } = await supabase
        .from('projects').select('*').eq('id', id).single();
      if (getErr || !existing) return res.status(404).json({ error: 'Project not found' });

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (client !== undefined) updates.client = client;
      if (notes !== undefined) updates.notes = notes;
      if (expiresAt !== undefined) updates.expires_at = expiresAt || null;

      let td = (typeof existing.target_data === 'object' && existing.target_data) ? { ...existing.target_data } : {};

      if (maxScans !== undefined) {
        td._max_scans = maxScans ? Number(maxScans) : null;
      }

      if (overlayType !== undefined) {
        td.overlay_type = overlayType;
      }

      if (overlayFraming !== undefined) {
        td.overlay_framing = overlayFraming;
        if (!td.properties) td.properties = {};
        if (overlayFraming && overlayFraming.aspectRatio) {
          td.properties.aspectRatio = overlayFraming.aspectRatio;
        }
      }

      const r2 = getR2();

      // 1. If Target Image was replaced
      if (imageBase64 || imagePath) {
        const resolvedImagePath = imagePath || `${id}/original.jpg`;
        if (imageBase64 && r2) {
          const buf = Buffer.from(imageBase64.split(',')[1] || imageBase64, 'base64');
          await r2.send(new PutObjectCommand({
            Bucket: R2_BUCKET, Key: resolvedImagePath, Body: buf, ContentType: 'image/jpeg'
          }));
        }

        const imgUrl = r2Url(resolvedImagePath);
        const imgFetch = await fetch(imgUrl);
        if (!imgFetch.ok) throw new Error('Cannot fetch replacement image from R2: ' + imgFetch.statusText);
        const imgBuffer = Buffer.from(await imgFetch.arrayBuffer());

        const newTargetData = await prepareTarget(imgBuffer, id);
        // Preserve views, max_scans, overlay type and model metadata
        newTargetData._views_count = td._views_count || existing.views_count || 0;
        newTargetData._max_scans = td._max_scans || null;
        newTargetData.overlay_type = td.overlay_type || 'video';
        newTargetData.model_path = td.model_path || null;
        newTargetData.model_url = td.model_url || null;
        // Preserve the user's framing choice across image replacement
        if (td.overlay_framing !== undefined) {
          newTargetData.overlay_framing = td.overlay_framing;
          if (newTargetData.overlay_framing && newTargetData.overlay_framing.aspectRatio) {
            if (!newTargetData.properties) newTargetData.properties = {};
            newTargetData.properties.aspectRatio = newTargetData.overlay_framing.aspectRatio;
          }
        }
        td = newTargetData;
        updates.image_path = resolvedImagePath;
      }

      // 2. If 3D Model was replaced
      if (modelBase64 || modelPath) {
        const resolvedModelPath = modelPath || `${id}/model.glb`;
        if (modelBase64 && r2) {
          const buf = Buffer.from(modelBase64.split(',')[1] || modelBase64, 'base64');
          if (!isGlb(buf)) return res.status(400).json({ error: 'That file is not a valid 3D model (.glb / glTF)' });
          await r2.send(new PutObjectCommand({
            Bucket: R2_BUCKET, Key: resolvedModelPath, Body: buf, ContentType: 'model/gltf-binary', CacheControl: ASSET_CACHE
          }));
        }
        td.overlay_type = '3d';
        td.model_path = resolvedModelPath;
        td.model_url = r2Url(resolvedModelPath);
        // Re-optimize the model in the background
        td.optimized_model_path = null;
        td.optimized_model_url = null;
        td.transcode_status = 'queued';
        td.transcode_error = null;
      }

      // 3. If Overlay Video was replaced
      if (videoBase64 || videoPath) {
        const resolvedVideoPath = videoPath || `${id}/video.mp4`;
        if (videoBase64 && r2) {
          const buf = Buffer.from(videoBase64.split(',')[1] || videoBase64, 'base64');
          await r2.send(new PutObjectCommand({
            Bucket: R2_BUCKET, Key: resolvedVideoPath, Body: buf, ContentType: 'video/mp4'
          }));
        }

        td.overlay_type = 'video';
        td.video_path = resolvedVideoPath;
        td.optimized_video_path = null;
        td.optimized_video_url = null;
        td.transcode_status = 'queued';
        td.transcode_error = null;
        updates.video_path = resolvedVideoPath;
      }

      updates.target_data = td;

      const { data, error } = await supabase
        .from('projects').update(updates).eq('id', id).select().single();
      if (error) return res.status(500).json({ error: error.message });

      cacheBust(id); // Invalidate AR viewer project cache so next scan gets fresh data
      res.json(formatProject(data));
    } catch (err) {
      console.error('Update project error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/projects/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      await purgeProjectFiles(id);
      res.json({ success: true });
    } catch (err) {
      console.error('Delete project error:', err);
      res.status(500).json({ error: err.message });
    }
  });
}

