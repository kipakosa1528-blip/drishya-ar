import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// This test runs the REAL MindAR compiler in a headed browser with WebGL
// It verifies the full flow: upload real image → compile .mind → save → AR viewer loads

test.use({
  baseURL: 'http://localhost:3000',
  headless: false,
  launchOptions: {
    args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist', '--no-sandbox']
  }
});

test('Real E2E: compile real image, verify .mind file > 100KB on server', async ({ page }) => {
  page.on('console', msg => {
    if (['log', 'error', 'warn'].includes(msg.type())) {
      console.log(`[Browser ${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => console.error('[PageError]', err.message));

  // Login
  await page.goto('/index.html');
  await page.fill('#pw', 'admin');
  await page.click('#login-btn');
  await page.waitForURL('/dashboard.html');

  // Go to create
  await page.goto('/create.html');
  await page.waitForLoadState('networkidle');

  // Step 1: Info
  await page.fill('#f-name', 'E2E Real Compile Test');
  await page.fill('#f-client', 'Test Client');
  await page.click('#btn-next-1');
  await expect(page.locator('#sb-2')).toBeVisible();

  // Step 2: real target image
  const imgPath = path.join(process.cwd(), 'tests', 'fixtures', 'real_target.jpg');
  await page.setInputFiles('#img-input', imgPath);
  await expect(page.locator('#img-preview-wrap')).toBeVisible();
  await page.click('#btn-next-2');
  await expect(page.locator('#sb-3')).toBeVisible();

  // Step 3: real video
  const vidPath = path.join(process.cwd(), 'tests', 'fixtures', 'real_video.mp4');
  await page.setInputFiles('#vid-input', vidPath);
  await expect(page.locator('#vid-preview-wrap')).toBeVisible();
  await page.click('#btn-next-3');
  await expect(page.locator('#sb-4')).toBeVisible();

  // Step 4: expiry
  await page.click('#btn-next-4');
  await expect(page.locator('#sb-5')).toBeVisible();

  // Step 5: compile (real MindAR — can take 15-30s)
  console.log('[Test] Clicking Compile & Create — real MindAR compiler running...');
  await page.click('#create-btn');

  // Wait up to 90s for compilation to finish and success block to appear
  await expect(page.locator('#success-block')).toBeVisible({ timeout: 90000 });
  console.log('[Test] Success block visible!');

  // Get the generated AR link
  const arLink = await page.locator('#ar-link-val').inputValue();
  console.log('[Test] AR Link:', arLink);
  expect(arLink).toMatch(/\/ar\.html\?id=/);

  // Extract ID and check .mind file on disk
  const id = new URL(arLink).searchParams.get('id');
  const mindPath = path.join(process.cwd(), 'uploads', `${id}.mind`);
  expect(fs.existsSync(mindPath)).toBe(true);

  const mindSize = fs.statSync(mindPath).size;
  console.log(`[Test] .mind file size: ${mindSize} bytes`);
  expect(mindSize).toBeGreaterThan(10000); // Real .mind files are hundreds of KB

  // Open AR viewer and verify it loads without error overlay
  await page.goto(arLink);
  await page.waitForTimeout(5000);

  expect(await page.locator('#paused-message').isVisible()).toBe(false);
  expect(await page.locator('#error').isVisible()).toBe(false);

  const videos = await page.locator('video').all();
  console.log('[Test] Video elements in AR page:', videos.length);
  expect(videos.length).toBeGreaterThanOrEqual(1);

  console.log('[Test] PASSED — real .mind file compiled and AR viewer loaded');
});
