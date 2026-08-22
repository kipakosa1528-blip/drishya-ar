// Security regression suite: auth on writes, public reads, static whitelist,
// presign key validation and /ar page hardening (XSS, expiry, scan limits).

import { test, expect } from '@playwright/test';
import {
  credsConfigured,
  CREDS_SKIP_REASON,
  getAuthHeaders,
  createProjectViaApi,
  deleteProjectViaApi,
} from './helpers.js';

test.describe('API security', () => {
  // ── Unauthenticated access control (no creds needed) ──────────────────────
  test('writes are rejected without a token', async ({ request }) => {
    const post = await request.post('/api/projects', { data: { id: 'x', name: 'x' } });
    expect(post.status()).toBe(401);

    const put = await request.put('/api/projects/some-id', { data: { name: 'x' } });
    expect(put.status()).toBe(401);

    const del = await request.delete('/api/projects/some-id');
    expect(del.status()).toBe(401);

    const presign = await request.get('/api/presign?key=00000000-0000-4000-8000-000000000000/video.mp4');
    expect(presign.status()).toBe(401);
  });

  test('reads stay public by design', async ({ request }) => {
    const list = await request.get('/api/projects');
    expect(list.status()).toBe(200);
    expect(await list.json()).toBeInstanceOf(Array);

    const config = await request.get('/api/config');
    expect(config.status()).toBe(200);
    const cfg = await config.json();
    expect(cfg).toHaveProperty('supabaseUrl');
    // The service key must never leak through config
    expect(JSON.stringify(cfg)).not.toContain('sb_secret');
    expect(JSON.stringify(cfg)).not.toContain(process.env.SUPABASE_SERVICE_KEY || 'SUPABASE_SERVICE_KEY_UNSET');
  });

  test('repo internals are not served statically', async ({ request }) => {
    for (const path of ['/.env', '/server.js', '/package.json', '/vercel.json']) {
      const res = await request.get(path);
      expect(res.status(), `${path} should not be served`).toBe(404);
    }
    // Whitelisted assets still serve
    expect((await request.get('/js/auth.js')).status()).toBe(200);
    expect((await request.get('/assets/logo.svg')).status()).toBe(200);
  });

  test('garbage tokens are rejected', async ({ request }) => {
    const res = await request.post('/api/projects', {
      data: { id: 'x', name: 'x' },
      headers: { Authorization: 'Bearer not-a-real-token' },
    });
    expect(res.status()).toBe(401);
  });

  // ── Authenticated behaviour (requires TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD)
  test.describe('authenticated', () => {
    test.skip(!credsConfigured, CREDS_SKIP_REASON);

    test('presign validates keys and mints URLs only for whitelisted shapes', async ({ request }) => {
      const headers = await getAuthHeaders(request);
      const uuid = '00000000-0000-4000-8000-000000000000';

      for (const bad of ['../etc/video.mp4', `${uuid}/evil.jpg`, `${uuid}/../../secret.mp4`, 'not-a-uuid/original.jpg']) {
        const res = await request.get(`/api/presign?key=${encodeURIComponent(bad)}`, { headers });
        expect(res.status(), `bad key ${bad} must be rejected`).toBe(400);
      }

      const ok = await request.get(`/api/presign?key=${uuid}/video.mp4`, { headers });
      expect(ok.status()).toBe(200);
      const body = await ok.json();
      expect(body.url).toBeTruthy();
      expect(body.publicUrl).toContain(`${uuid}/video.mp4`);
    });

    test('full CRUD round-trip requires auth at each write step', async ({ request }) => {
      const seeded = await createProjectViaApi(request);
      try {
        const put = await request.put(`/api/projects/${seeded.id}`, {
          data: { notes: 'updated by qa' },
          headers: await getAuthHeaders(request),
        });
        expect(put.status()).toBe(200);
        expect((await put.json()).notes).toBe('updated by qa');

        const unauthDelete = await request.delete(`/api/projects/${seeded.id}`);
        expect(unauthDelete.status()).toBe(401);
      } finally {
        expect(await deleteProjectViaApi(request, seeded.id)).toBe(true);
      }
    });

    test('/ar escapes project names (XSS regression)', async ({ request }) => {
      const evilName = '<script>alert("xss")</script>';
      const seeded = await createProjectViaApi(request, { name: evilName });
      try {
        const res = await request.get(`/ar?id=${seeded.id}`);
        expect(res.status()).toBe(200);
        const html = await res.text();
        expect(html).not.toContain(`<script>alert(`); // raw injection must not appear
        expect(html).toContain('&lt;script&gt;'); // escaped form does
      } finally {
        await deleteProjectViaApi(request, seeded.id);
      }
    });

    test('/ar shows expired page for past expiry dates', async ({ request }) => {
      const seeded = await createProjectViaApi(request, {
        expiresAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      });
      try {
        const res = await request.get(`/ar?id=${seeded.id}`);
        expect(res.status()).toBe(403);
        expect(await res.text()).toContain('Experience Expired');
      } finally {
        await deleteProjectViaApi(request, seeded.id);
      }
    });

    test('/ar enforces scan limits', async ({ request }) => {
      const seeded = await createProjectViaApi(request, { maxScans: 1 });
      try {
        const first = await request.get(`/ar?id=${seeded.id}`);
        expect(first.status()).toBe(200); // first scan allowed

        const second = await request.get(`/ar?id=${seeded.id}`);
        expect(second.status()).toBe(403); // limit reached
        expect(await second.text()).toContain('Scan Limit Reached');
      } finally {
        await deleteProjectViaApi(request, seeded.id);
      }
    });

    test('deleting a project removes it from the public list', async ({ request }) => {
      const seeded = await createProjectViaApi(request);
      await deleteProjectViaApi(request, seeded.id);
      const list = await (await request.get('/api/projects')).json();
      expect(list.find(p => p.id === seeded.id)).toBeUndefined();
    });
  });
});

