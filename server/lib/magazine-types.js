// Kipakosa AR — Magazine Data Types & Normalizers

import { r2Url } from './clients.js';

/**
 * @typedef {'video' | 'image'} OverlayType
 * 
 * @typedef {Object} MagazineOverlay
 * @property {OverlayType} type
 * @property {string} path - Storage path in R2 or cloud storage
 * @property {string} url - Public access URL
 * @property {string|null} [muxPlaybackId] - Mux stream playback ID (if video)
 * @property {string|null} [muxAssetId] - Mux asset ID (if video)
 * @property {string|null} [muxStreamUrl] - HLS stream URL (if video)
 * @property {number} [aspectRatio] - Video/image aspect ratio (W / H)
 * @property {number} [planeW] - Rendered AR plane width
 * @property {number} [planeH] - Rendered AR plane height
 * @property {boolean} [loop]
 * @property {boolean} [autoplay]
 * @property {boolean} [muted]
 * 
 * @typedef {Object} MagazineTarget
 * @property {string} id - Unique target identifier (e.g. "target_1", "cover")
 * @property {number} pageNumber - Magazine printed page number (e.g. 1, 2, 4)
 * @property {string} name - Display name (e.g. "Cover Page", "Spread 4-5")
 * @property {string} targetName - 8th Wall target name identifier (e.g. "target0", "target1")
 * @property {string} imagePath - Storage path to target image
 * @property {string} imageUrl - Public URL to target image
 * @property {string} [luminancePath] - Grayscale 8th Wall target luminance map path
 * @property {string} [luminanceUrl] - Public URL to luminance map
 * @property {Record<string, unknown>} [targetData] - 8th Wall planar descriptor
 * @property {MagazineOverlay} overlay - Bound AR visual overlay (image or video)
 * 
 * @typedef {Object} Magazine
 * @property {string} id - UUID
 * @property {string} title - Magazine publication title
 * @property {string} issueNumber - Volume / issue name
 * @property {string} client - Publisher or client name
 * @property {string} notes - Editorial or internal notes
 * @property {string} coverImagePath - Cover preview image path
 * @property {string} coverImageUrl - Cover preview public URL
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string|null} expiresAt
 * @property {number|null} maxScans
 * @property {number} viewsCount
 * @property {string|null} lastScannedAt
 * @property {'draft' | 'published' | 'archived'} status
 * @property {MagazineTarget[]} targets - Array of bound target pages
 */

/**
 * Normalize an overlay descriptor.
 * @param {Record<string, unknown>} raw
 * @returns {MagazineOverlay}
 */
export function formatOverlay(raw = {}) {
  const type = raw.type === 'image' || raw.overlay_type === 'image' ? 'image' : 'video';
  const path = raw.path || raw.overlay_path || raw.video_path || raw.image_path || '';
  const muxPlaybackId = raw.muxPlaybackId || raw.mux_playback_id || null;
  const muxAssetId = raw.muxAssetId || raw.mux_asset_id || null;
  const muxStreamUrl = muxPlaybackId ? `https://stream.mux.com/${muxPlaybackId}.m3u8` : null;
  const muxVideoUrl = muxPlaybackId ? `https://stream.mux.com/${muxPlaybackId}/capped-1080p.mp4` : null;

  let url = raw.url || raw.overlay_url || '';
  if (muxVideoUrl) {
    url = muxVideoUrl;
  } else if (!url && path) {
    url = path.startsWith('http') ? path : r2Url(path);
  }

  const aspect = Number(raw.aspectRatio || raw.aspect_ratio || 1);
  const planeW = aspect >= 1 ? 1 : Number(aspect.toFixed(4));
  const planeH = aspect >= 1 ? Number((1 / aspect).toFixed(4)) : 1;

  return {
    type,
    path,
    url,
    muxPlaybackId,
    mux_playback_id: muxPlaybackId,
    muxAssetId,
    mux_asset_id: muxAssetId,
    muxStreamUrl,
    mux_stream_url: muxStreamUrl,
    aspectRatio: aspect,
    aspect_ratio: aspect,
    planeW,
    planeH,
    loop: raw.loop !== false,
    autoplay: raw.autoplay !== false,
    muted: !!raw.muted,
  };
}

/**
 * Normalize a magazine target object.
 * @param {Record<string, unknown>} raw
 * @param {number} [index]
 * @returns {MagazineTarget}
 */
export function formatMagazineTarget(raw = {}, index = 0) {
  const id = String(raw.id || `target_${index + 1}`);
  const pageNumber = Number(raw.pageNumber || raw.page_number || index + 1);
  const name = raw.name || `Page ${pageNumber}`;
  const targetName = raw.targetName || raw.target_name || `target${index}`;
  const imagePath = raw.imagePath || raw.image_path || '';
  const imageUrl = raw.imageUrl || raw.image_url || (imagePath ? (imagePath.startsWith('http') ? imagePath : r2Url(imagePath)) : '');
  const luminancePath = raw.luminancePath || raw.luminance_path || '';
  const luminanceUrl = raw.luminanceUrl || raw.luminance_url || (luminancePath ? (luminancePath.startsWith('http') ? luminancePath : r2Url(luminancePath)) : '');
  const td = (typeof raw.targetData === 'object' && raw.targetData) ? raw.targetData : (typeof raw.target_data === 'object' && raw.target_data ? raw.target_data : null);

  const overlayRaw = (typeof raw.overlay === 'object' && raw.overlay) ? raw.overlay : raw;
  const overlay = formatOverlay(overlayRaw);

  return {
    id,
    pageNumber,
    page_number: pageNumber,
    name,
    targetName,
    target_name: targetName,
    imagePath,
    image_path: imagePath,
    imageUrl,
    image_url: imageUrl,
    luminancePath,
    luminance_path: luminancePath,
    luminanceUrl,
    luminance_url: luminanceUrl,
    targetData: td,
    target_data: td,
    overlay,
  };
}

/**
 * Normalize a database row for magazine API consumers.
 * Emits both camelCase and snake_case for seamless frontend compatibility.
 * @param {Record<string, unknown>} row
 * @returns {Magazine|null}
 */
export function formatMagazine(row) {
  if (!row) return null;

  const rawTargets = Array.isArray(row.targets) ? row.targets : [];
  const targets = rawTargets.map(formatMagazineTarget);
  const coverImagePath = row.cover_image_path || row.coverImagePath || (targets[0]?.imagePath || '');
  const coverImageUrl = coverImagePath ? (coverImagePath.startsWith('http') ? coverImagePath : r2Url(coverImagePath)) : '';

  return {
    id: row.id,
    title: row.title || row.name || 'Untitled Magazine',
    name: row.title || row.name || 'Untitled Magazine',
    issueNumber: row.issue_number || row.issueNumber || '',
    issue_number: row.issue_number || row.issueNumber || '',
    client: row.client || '',
    notes: row.notes || '',
    coverImagePath,
    cover_image_path: coverImagePath,
    coverImageUrl,
    cover_image_url: coverImageUrl,
    createdAt: row.created_at || row.createdAt,
    created_at: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
    updated_at: row.updated_at || row.updatedAt,
    expiresAt: row.expires_at || row.expiresAt || null,
    expires_at: row.expires_at || row.expiresAt || null,
    maxScans: row.max_scans || row.maxScans || null,
    max_scans: row.max_scans || row.maxScans || null,
    viewsCount: Number(row.views_count || row.viewsCount || 0),
    views_count: Number(row.views_count || row.viewsCount || 0),
    lastScannedAt: row.last_scanned_at || row.lastScannedAt || null,
    last_scanned_at: row.last_scanned_at || row.lastScannedAt || null,
    status: row.status || 'draft',
    targetsCount: targets.length,
    targets_count: targets.length,
    targets,
  };
}
