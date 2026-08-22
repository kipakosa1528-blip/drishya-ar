// Admin app flows: login via /admin.html (Supabase Auth), dashboard stats,
// projects list and project detail for a seeded project.

import { test, expect } from '@playwright/test';
import path from 'path';
import {
  credsConfigured,
  CREDS_SKIP_REASON,
  getAdminCreds,
  getAuthHeaders,
  createProjectViaApi,
  deleteProjectViaApi,
} from './helpers.js';

test.use({ baseURL: 'http://localhost:3000' });

async function uiLogin(page) {
  const { email, password } = getAdminCreds();
  await page.goto('/admin.html');
  await page.fill('#email', email);
  await page.fill('#pw', password);
  await page.click('#login-btn');
  await page.waitForURL('/dashboard.html', { timeout: 15000 });
}

test.describe('admin app', () => {
  test.skip(!credsConfigured, CREDS_SKIP_REASON);

  let seeded;

  test.beforeAll(async ({ request }) => {
    const headers = await getAuthHeaders(request);
    void headers;
    seeded = await createProjectViaApi(request, { name: 'Playwright Wedding Frame', client: 'Saugat & Co' });
  });

  test.afterAll(async ({ request }) => {
    if (seeded) await deleteProjectViaApi(request, seeded.id);
  });

  test('login page rejects wrong password and accepts correct one', async ({ page }) => {
    const { email } = getAdminCreds();
    await page.goto('/admin.html');
    await page.fill('#email', email);
    await page.fill('#pw', 'definitely-wrong-password');
    await page.click('#login-btn');
    await expect(page.locator('#err-msg')).toBeVisible({ timeout: 15000 });
    expect(page.url()).not.toContain('dashboard');

    await page.fill('#pw', getAdminCreds().password);
    await page.click('#login-btn');
    await page.waitForURL('/dashboard.html', { timeout: 15000 });
  });

  test('unauthenticated dashboard redirects to admin login', async ({ page }) => {
    await page.goto('/dashboard.html');
    await page.waitForURL(/\/admin\.html/, { timeout: 10000 });
  });

  test('dashboard shows seeded project across pages', async ({ page }) => {
    await uiLogin(page);

    await expect(page.locator('.page-title')).toContainText('Dashboard Overview');
    await expect(page.locator('#st-total')).not.toHaveText('0');

    // Projects list contains the seeded project
    await page.goto('/projects.html');
    await expect(page.locator('#proj-body')).toContainText('Playwright Wedding Frame');
    await expect(page.locator('#proj-body')).toContainText('Saugat & Co');

    // Project detail renders its fields
    await page.goto(`/project.html?id=${seeded.id}`);
    await expect(page.locator('#p-title')).toHaveText('Playwright Wedding Frame');
    await expect(page.locator('#p-client')).toHaveText('Saugat & Co');
  });

  test('create wizard navigation works after login', async ({ page }) => {
    await uiLogin(page);

    await page.goto('/create.html');
    await expect(page.locator('#sb-1')).toBeVisible();

    await page.fill('#f-name', 'Test AR Project');
    await page.fill('#f-client', 'Test Client');
    await page.click('#btn-next-1');
    await expect(page.locator('#sb-2')).toBeVisible();

    const imagePath = path.join(process.cwd(), 'tests', 'fixtures', 'test_target.png');
    await page.setInputFiles('#img-input', imagePath);
    await expect(page.locator('#img-preview-wrap')).toBeVisible();
    await page.click('#btn-next-2');
    await expect(page.locator('#sb-3')).toBeVisible();

    const videoPath = path.join(process.cwd(), 'tests', 'fixtures', 'test_video.mp4');
    await page.setInputFiles('#vid-input', videoPath);
    await expect(page.locator('#vid-preview-wrap')).toBeVisible();
    await page.click('#btn-next-3');
    await expect(page.locator('#sb-4')).toBeVisible();

    await page.click('#btn-next-4');
    await expect(page.locator('#sb-5')).toBeVisible();
    await expect(page.locator('#r-name')).toHaveText('Test AR Project');
  });
});

