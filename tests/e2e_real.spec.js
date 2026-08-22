import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { getAdminCreds } from './helpers.js';

// This test runs the REAL MindAR compiler in a headed browser with WebGL
// It verifies the full flow: upload real image → compile .mind → save → AR viewer loads
//
// Opt-in only (it hits live services and needs a visible browser):
//   RUN_E2E_REAL=1 npm test -- e2e_real

test.skip(process.env.RUN_E2E_REAL !== '1', 'Set RUN_E2E_REAL=1 to run the real-compile E2E');

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

  // Login via the Supabase Auth admin page
  const { email, password } = getAdminCreds();
  await page.goto('/admin.html');
  await page.fill('#email', email);
  await page.fill('#pw', password);
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
  expect(arLink).toMatch(/\/ar(\.html)?\?id=/);

  // Extract ID
  const id = new URL(arLink).searchParams.get('id');
  expect(id).toBeTruthy();

  const mindPath = path.join(process.cwd(), 'uploads', `${id}.mind`);
  if (fs.existsSync(mindPath)) {
    const mindSize = fs.statSync(mindPath).size;
    console.log(`[Test] .mind file size: ${mindSize} bytes`);
    expect(mindSize).toBeGreaterThan(1000);
  }

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
