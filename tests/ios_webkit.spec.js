// iOS / Safari regression suite (runs under Playwright WebKit = the Safari engine).
//
// IMPORTANT LIMITATION: WebKit is not iOS Safari. It runs on desktop and has no
// camera/WebRTC, so it cannot validate the 8th Wall camera/AR path. What it DOES
// validate is the exact code paths that broke on iPhones before:
//   - the AR page loads without app JS errors under the Safari engine
//   - the overlay <video> is configured iOS-safely (muted, playsinline, crossOrigin)
//   - muted autoplay actually starts (iOS-legal) and a tap unmutes it
//   - the crop is applied to geometry UVs (the iOS ios10hls shader ignores texture repeat)
//   - no Mux URL leaks back in
//
// Run:  npx playwright test --project=webkit

import { test, expect } from '@playwright/test';

const PROJECT_ID = process.env.TEST_AR_PROJECT_ID || '710e85bb-f813-48f3-98a1-1809d5d13a7c';

const APP_ERROR_RE = /is not defined|is not a function|Cannot read|Unexpected token|SyntaxError/;
const appErrors = (errs) => errs.filter((e) => APP_ERROR_RE.test(e));

test.describe('iOS / Safari (WebKit engine)', () => {
  test('AR viewer loads and plays the optimized overlay', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    const resp = await page.goto(`/ar?id=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    test.skip(!resp || resp.status() >= 400, 'AR project not available');

    // Wait for the video metadata to arrive.
    await page.waitForTimeout(6000);

    const v = page.locator('#ar-video');
    await expect(v).toHaveCount(1);

    const info = await v.evaluate((el) => ({
      src: el.getAttribute('src') || '',
      preload: el.preload,
      muted: el.muted,
      playsinline: el.hasAttribute('playsinline'),
      crossOrigin: el.getAttribute('crossorigin'),
      readyState: el.readyState,
      paused: el.paused,
    }));

    // iOS-safe configuration
    expect(info.preload).toBe('metadata');
    expect(info.playsinline).toBe(true);
    expect(info.crossOrigin).toBe('anonymous');
    expect(info.src).not.toContain('stream.mux.com');
    expect(info.src).toMatch(/\/(optimized|video)\.mp4/);

    // Muted autoplay must actually run (this is what makes iOS show visuals).
    expect(info.readyState).toBeGreaterThanOrEqual(2);
    expect(info.paused).toBe(false);

    // The crop must be applied to geometry UVs (survives the iOS shader swap).
    expect(await page.evaluate(() => document.documentElement.outerHTML.includes('applyUVCrop'))).toBe(true);

    // Tap-to-unmute (the iOS autoplay-with-sound fix).
    await expect(page.locator('#tap-cue')).toHaveCount(1);
    if (info.muted) {
      await page.click('body', { position: { x: 12, y: 12 } });
      await page.waitForTimeout(600);
      expect(await v.evaluate((el) => el.muted)).toBe(false);
    }

    expect(appErrors(errors)).toEqual([]);
  });

  test('public pages render in WebKit without app errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    for (const path of ['/landing', '/admin']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(700);
    }

    expect(appErrors(errors)).toEqual([]);
  });
});
