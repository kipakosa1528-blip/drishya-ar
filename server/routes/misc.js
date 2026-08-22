// Misc API routes: R2 presigned uploads (admin only) and public config.

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getR2, R2_BUCKET, r2Url, ADMIN_EMAIL } from '../lib/clients.js';
import { rateLimit } from '../lib/security.js';

// Keys are locked to <uuid>/(original.jpg|luminance.jpg|video.mp4) so a signed
// URL can never be minted for an arbitrary bucket path.
const PRESIGN_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(original\.jpg|luminance\.jpg|video\.mp4)$/;

export function registerMiscRoutes(app, { requireAuth }) {
  app.get('/api/presign', requireAuth, rateLimit({ max: 30 }), async (req, res) => {
    const { key, type } = req.query;
    const r2 = getR2();
    if (!key) return res.status(400).json({ error: 'Missing key' });
    if (!PRESIGN_KEY_RE.test(key)) return res.status(400).json({ error: 'Invalid key' });
    if (!r2)  return res.status(503).json({ error: 'R2 not configured' });
    try {
      const cmd = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: type || 'application/octet-stream' });
      const url = await getSignedUrl(r2, cmd, { expiresIn: 3600 });
      res.json({ url, publicUrl: r2Url(key) });
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
}

