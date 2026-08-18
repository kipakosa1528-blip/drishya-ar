import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.use({ baseURL: 'http://localhost:3000' });

// Seed a test project via API directly (bypasses in-browser MindAR compiler)
async function seedProject(request) {
  const imgBase64 = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'test_target.png')).toString('base64');
  const vidBase64 = 'data:video/mp4;base64,' + fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'test_video.mp4')).toString('base64');
  const mindBase64 = 'data:application/octet-stream;base64,' + Buffer.from([77,73,78,68,65,82]).toString('base64');

  const id = 'test-' + Date.now();
  const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const res = await request.post('/api/projects', {
    data: { id, name: 'Playwright Wedding Frame', client: 'Saugat & Co', notes: 'E2E Test', expiresAt: expiry, imageBase64: imgBase64, videoBase64: vidBase64, mindBase64: mindBase64 },
    headers: { 'Content-Type': 'application/json' }
  });
  expect(res.status()).toBe(201);
  return (await res.json());
}

test('Dashboard shows seeded project', async ({ page, request }) => {
  const proj = await seedProject(request);

  // Login
  await page.goto('/index.html');
  await page.fill('#pw', 'admin');
  await page.click('#login-btn');
  await page.waitForURL('/dashboard.html');
  await expect(page.locator('.page-title')).toContainText('Dashboard Overview');

  // Dashboard should show project count > 0
  const totalText = await page.locator('#st-total').textContent();
  expect(parseInt(totalText)).toBeGreaterThanOrEqual(1);

  // Projects page search
  await page.goto('/projects.html');
  await expect(page.locator('#proj-body')).toContainText('Playwright Wedding Frame');
  await expect(page.locator('#proj-body')).toContainText('Saugat & Co');

  // Project detail
  await page.click(`a[href="project.html?id=${proj.id}"]`);
  await page.waitForURL(/\/project\.html\?id=/);
  await expect(page.locator('#p-title')).toHaveText('Playwright Wedding Frame');
  await expect(page.locator('#p-client')).toHaveText('Saugat & Co');
});

test('Create page wizard navigation works', async ({ page, request }) => {
  await page.goto('/index.html');
  await page.fill('#pw', 'admin');
  await page.click('#login-btn');
  await page.waitForURL('/dashboard.html');

  await page.goto('/create.html');
  await expect(page.locator('#sb-1')).toBeVisible();

  // Step 1
  await page.fill('#f-name', 'Test AR Project');
  await page.fill('#f-client', 'Test Client');
  await page.click('#btn-next-1');
  await expect(page.locator('#sb-2')).toBeVisible();

  // Step 2 — set file via input
  const imagePath = path.join(process.cwd(), 'tests', 'fixtures', 'test_target.png');
  await page.setInputFiles('#img-input', imagePath);
  await expect(page.locator('#img-preview-wrap')).toBeVisible();
  await page.click('#btn-next-2');
  await expect(page.locator('#sb-3')).toBeVisible();

  // Step 3
  const videoPath = path.join(process.cwd(), 'tests', 'fixtures', 'test_video.mp4');
  await page.setInputFiles('#vid-input', videoPath);
  await expect(page.locator('#vid-preview-wrap')).toBeVisible();
  await page.click('#btn-next-3');
  await expect(page.locator('#sb-4')).toBeVisible();

  // Step 4
  await page.click('#btn-next-4');
  await expect(page.locator('#sb-5')).toBeVisible();
  await expect(page.locator('#r-name')).toHaveText('Test AR Project');
});
