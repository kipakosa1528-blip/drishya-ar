// Kipakosa AR — Magazines REST API
// Reads are PUBLIC; all write operations require Supabase Auth token.

import express from 'express';
import { PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { supabase, getR2, R2_BUCKET, r2Url, prepareMagazineTarget, createMuxAsset } from '../lib/clients.js';
import { formatMagazine } from '../lib/magazine-types.js';

/** Purge all R2 files stored under a magazine ID prefix. */
async function purgeMagazineFiles(id) {
  const r2 = getR2();
  if (!r2) return;
  try {
    const listed = await r2.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: `magazines/${id}/` }));
    const objects = (listed.Contents || []).map(o => ({ Key: o.Key }));
    if (objects.length === 0) return;
    await r2.send(new DeleteObjectsCommand({ Bucket: R2_BUCKET, Delete: { Objects: objects } }));
  } catch (err) {
    console.error('R2 purge failed for magazine', id, err.message);
  }
}

export function registerMagazinesRoutes(app, { requireAuth }) {
  // ── Reads (Public) ──────────────────────────────────────────────────────────
  app.get('/api/magazines', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('magazines')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // If the table is not yet created in Supabase, return empty array gracefully
        if (error.code === '42P01' || error.code === 'PGRST204' || error.message?.includes('schema cache') || error.message?.includes('Could not find the table')) {
          return res.json([]);
        }
        return res.status(500).json({ error: error.message });
      }
      res.json((data || []).map(formatMagazine));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/magazines/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { data, error } = await supabase
        .from('magazines')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Magazine not found' });
      }
      res.json(formatMagazine(data));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Writes (Authenticated) ─────────────────────────────────────────────────
  app.post('/api/magazines', express.json({ limit: '150mb' }), requireAuth, async (req, res) => {
    try {
      const {
        id,
        title,
        issueNumber,
        issue_number,
        client,
        notes,
        expiresAt,
        expires_at,
        maxScans,
        max_scans,
        status = 'draft',
        coverImagePath,
        cover_image_path,
        targets = []
      } = req.body;

      if (!id || !title) {
        return res.status(400).json({ error: 'Missing required fields: id, title' });
      }

      const processedTargets = [];
      const r2 = getR2();

      // Process each target and its overlay (image or video)
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        const targetId = t.id || `target_${i + 1}`;
        const pageNum = t.pageNumber || t.page_number || i + 1;
        const targetName = t.targetName || t.target_name || `target${i}`;
        let imagePath = t.imagePath || t.image_path || `magazines/${id}/targets/${i}/original.jpg`;
        let overlayPath = t.overlayPath || t.overlay_path || t.videoPath || t.video_path || `magazines/${id}/targets/${i}/overlay.mp4`;
        const overlayType = (t.overlayType || t.overlay_type || 'video') === 'image' ? 'image' : 'video';

        // Upload base64 target image if provided
        if (t.imageBase64 && r2) {
          const buf = Buffer.from(t.imageBase64.split(',')[1] || t.imageBase64, 'base64');
          await r2.send(new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: imagePath,
            Body: buf,
            ContentType: 'image/jpeg'
          }));
        }

        // Upload base64 overlay if provided
        if (t.overlayBase64 && r2) {
          const buf = Buffer.from(t.overlayBase64.split(',')[1] || t.overlayBase64, 'base64');
          await r2.send(new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: overlayPath,
            Body: buf,
            ContentType: overlayType === 'image' ? 'image/jpeg' : 'video/mp4'
          }));
        }

        // Generate 8th Wall planar target descriptor via sharp
        let targetData = t.targetData || t.target_data || null;
        if (!targetData) {
          try {
            const imgUrl = r2Url(imagePath);
            const imgFetch = await fetch(imgUrl);
            if (imgFetch.ok) {
              const imgBuffer = Buffer.from(await imgFetch.arrayBuffer());
              targetData = await prepareMagazineTarget(imgBuffer, id, i, targetName);
            }
          } catch (prepErr) {
            console.warn(`Target ${i} prep warning:`, prepErr.message);
          }
        }

        // Ingest video into Mux for video overlays
        let muxPlaybackId = t.muxPlaybackId || t.mux_playback_id || null;
        let muxAssetId = t.muxAssetId || t.mux_asset_id || null;
        if (overlayType === 'video' && !muxPlaybackId) {
          try {
            const overlayPublicUrl = overlayPath.startsWith('http') ? overlayPath : r2Url(overlayPath);
            const muxResult = await createMuxAsset(overlayPublicUrl);
            if (muxResult) {
              muxAssetId = muxResult.assetId;
              muxPlaybackId = muxResult.playbackId;
            }
          } catch (muxErr) {
            console.warn(`Mux video ingestion for target ${i} warning:`, muxErr.message);
          }
        }

        processedTargets.push({
          id: targetId,
          page_number: pageNum,
          name: t.name || `Page ${pageNum}`,
          target_name: targetName,
          image_path: imagePath,
          image_url: r2Url(imagePath),
          target_data: targetData,
          overlay: {
            type: overlayType,
            path: overlayPath,
            url: muxPlaybackId ? `https://stream.mux.com/${muxPlaybackId}/capped-1080p.mp4` : r2Url(overlayPath),
            mux_playback_id: muxPlaybackId,
            mux_asset_id: muxAssetId,
            mux_stream_url: muxPlaybackId ? `https://stream.mux.com/${muxPlaybackId}.m3u8` : null,
            loop: t.loop !== false,
            autoplay: t.autoplay !== false,
            muted: !!t.muted,
          }
        });
      }

      const { data, error: dbErr } = await supabase.from('magazines').insert({
        id,
        title,
        issue_number: issueNumber || issue_number || '',
        client: client || '',
        notes: notes || '',
        expires_at: expiresAt || expires_at || null,
        max_scans: maxScans ? Number(maxScans) : (max_scans ? Number(max_scans) : null),
        status,
        cover_image_path: coverImagePath || cover_image_path || (processedTargets[0]?.image_path || ''),
        targets: processedTargets
      }).select().single();

      if (dbErr) throw new Error('DB insert failed: ' + dbErr.message);

      res.status(201).json(formatMagazine(data));
    } catch (err) {
      console.error('Create magazine error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/magazines/:id', express.json({ limit: '150mb' }), requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const {
        title,
        issueNumber,
        issue_number,
        client,
        notes,
        expiresAt,
        expires_at,
        maxScans,
        max_scans,
        status,
        coverImagePath,
        cover_image_path,
        targets
      } = req.body;

      const updates = { updated_at: new Date().toISOString() };
      if (title !== undefined) updates.title = title;
      if (issueNumber !== undefined || issue_number !== undefined) updates.issue_number = issueNumber || issue_number;
      if (client !== undefined) updates.client = client;
      if (notes !== undefined) updates.notes = notes;
      if (expiresAt !== undefined || expires_at !== undefined) updates.expires_at = expiresAt || expires_at;
      if (maxScans !== undefined || max_scans !== undefined) updates.max_scans = maxScans || max_scans;
      if (status !== undefined) updates.status = status;
      if (coverImagePath !== undefined || cover_image_path !== undefined) updates.cover_image_path = coverImagePath || cover_image_path;
      if (targets !== undefined) updates.targets = targets;

      const { data, error } = await supabase
        .from('magazines')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.json(formatMagazine(data));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/magazines/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { error } = await supabase.from('magazines').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      await purgeMagazineFiles(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
