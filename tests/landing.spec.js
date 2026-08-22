// Landing page QA for the current "Living Prints" editorial design.
// The old reveal-card suites targeted a replaced layout; these cover the
// live structure: sections render, routing works, reduced-motion is clean.

import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://localhost:3000' });

const SECTIONS = [
  '.cinematic-cover-hero',
  '.hero-story-section',
  '.horizontal-exhibition-section',
  '.asymmetric-gallery-section',
  '.optical-stage-section',
  '.manifesto-section',
];

test.describe('Kipakosa AR landing', () => {
  test('/ renders all major sections without broken layout', async ({ page }) => {
    const consoleErrors = [];
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.goto('/');
    await expect(page).toHaveTitle(/Kipakosa/);

    for (const selector of SECTIONS) {
      await expect(page.locator(selector)).toBeAttached();
    }

    // Hero is actually visible on load
    await expect(page.locator('.cinematic-cover-hero').first()).toBeVisible();

    // No uncaught page errors while loading
    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });

  test('/landing serves the same page', async ({ page }) => {
    await page.goto('/landing');
    await expect(page.locator('.cinematic-cover-hero').first()).toBeVisible();
  });

  test('/index.html forwards visitors to the landing page', async ({ page }) => {
    await page.goto('/index.html');
    // index.html is now a tiny redirect page to /
    await page.waitForURL(u => !u.pathname.includes('index.html'), { timeout: 10000 });
    expect(new URL(page.url()).pathname).toMatch(/^\/$|^\/$/);
    await expect(page.locator('.cinematic-cover-hero').first()).toBeVisible();
  });

  test('/admin.html renders the Supabase Auth login form', async ({ page }) => {
    await page.goto('/admin.html');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#pw')).toBeVisible();
    await expect(page.locator('#login-btn')).toBeVisible();
    // Legacy hint must be gone
    const body = await page.locator('body').innerHTML();
    expect(body).not.toContain('drishya2024');
  });

  test('reduced-motion mode renders cleanly', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.goto('/');
    for (const selector of SECTIONS) {
      await expect(page.locator(selector)).toBeAttached();
    }
    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
    await ctx.close();
  });
});
