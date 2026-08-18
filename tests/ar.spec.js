import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.use({ baseURL: 'http://localhost:3000', permissions: ['camera'] });

// Seed project via API
async function seedProject(request) {
  const imgBase64 = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'test_target.png')).toString('base64');
  const vidBase64 = 'data:video/mp4;base64,' + fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'test_video.mp4')).toString('base64');
  const mindBase64 = 'data:application/octet-stream;base64,' + Buffer.from([77,73,78,68,65,82]).toString('base64');

  const id = 'artest-' + Date.now();
  const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const res = await request.post('/api/projects', {
    data: { id, name: 'AR Viewer Test', client: 'Test', expiresAt: expiry, imageBase64: imgBase64, videoBase64: vidBase64, mindBase64: mindBase64 },
    headers: { 'Content-Type': 'application/json' }
  });
  expect(res.status()).toBe(201);
  return (await res.json());
}

test('AR Viewer loads without expired overlay', async ({ page, request }) => {
  const proj = await seedProject(request);
  const arUrl = `http://localhost:3000/ar.html?id=${proj.id}`;
  console.log('Generated AR Link:', arUrl);

  await page.goto(arUrl);
  await page.waitForTimeout(4000);

  // expired/error overlay must NOT be visible
  expect(await page.locator('#paused-message').isVisible()).toBe(false);
  expect(await page.locator('#error').isVisible()).toBe(false);

  // Video element must exist (even if camera not available in headless)
  const videos = await page.locator('video').all();
  console.log('Video elements count in AR page:', videos.length);
  expect(videos.length).toBeGreaterThanOrEqual(1);
});
