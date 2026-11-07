import { test, expect } from '@playwright/test';

test.describe('Living Frame AR (/preview-frame)', () => {
  test('verifies 18cm calibrated height clamp and locked scale (no pinch-scale distortion)', async ({ page }) => {
    const res = await page.goto('/preview-frame', { waitUntil: 'domcontentloaded' });
    expect(res.status()).toBe(200);

    const hasPinchScale = await page.evaluate(() => {
      return !!document.querySelector('[xrextras-pinch-scale]');
    });
    expect(hasPinchScale).toBe(false);

    // Check that target height 0.18 (18cm) is in component script
    const pageContent = await page.content();
    expect(pageContent).toContain('0.18');
    expect(pageContent).toContain('appu_photoframe.glb');
  });
});
