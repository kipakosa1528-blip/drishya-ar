// Public AR viewer (/ar?id=...) renders the 8th Wall experience for a
// freshly seeded project: video element present, no expiry/limit overlays.

import { test, expect } from '@playwright/test';
import {
  credsConfigured,
  CREDS_SKIP_REASON,
  createProjectViaApi,
  deleteProjectViaApi,
} from './helpers.js';

test.use({ baseURL: 'http://localhost:3000', permissions: ['camera'] });

test.describe('AR viewer', () => {
  test.skip(!credsConfigured, CREDS_SKIP_REASON);

  test('viewer loads video for a live project', async ({ page, request }) => {
    const seeded = await createProjectViaApi(request, { name: 'AR Viewer Test' });
    try {
      await page.goto(`/ar?id=${seeded.id}`);
      // The server-rendered viewer must not show error states
      await expect(page.locator('#ar-video')).toHaveCount(1);
      const body = await page.locator('body').innerHTML();
      expect(body).not.toContain('Experience Expired');
      expect(body).not.toContain('Scan Limit Reached');
    } finally {
      await deleteProjectViaApi(request, seeded.id);
    }
  });

  test('missing id returns 400 and unknown id returns 404', async ({ request }) => {
    expect((await request.get('/ar')).status()).toBe(400);
    expect((await request.get('/ar?id=does-not-exist-xyz')).status()).toBe(404);
  });
});

