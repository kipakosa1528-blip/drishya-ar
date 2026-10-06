import { test, expect, devices } from '@playwright/test';

test.use({
  ...devices['iPhone 14'],
});

test.describe('Native Web AR Living Frame (<model-viewer>) Test Suite', () => {
  test('serves /preview-frame-mv with valid <model-viewer> config, 1:1 fixed scale, and USDZ companion', async ({ page, request }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => {
      consoleErrors.push(err.message || String(err));
    });

    // 1. Verify clean endpoint status
    const response = await page.goto('/preview-frame-mv', { waitUntil: 'domcontentloaded' });
    expect(response.status()).toBe(200);

    // 2. Verify model-viewer component and its required AR attributes
    const mvAttributes = await page.evaluate(() => {
      const mv = document.querySelector('model-viewer');
      if (!mv) return null;
      return {
        hasAr: mv.hasAttribute('ar'),
        arScale: mv.getAttribute('ar-scale'),
        arPlacement: mv.getAttribute('ar-placement'),
        arModes: mv.getAttribute('ar-modes'),
        src: mv.getAttribute('src'),
        iosSrc: mv.getAttribute('ios-src'),
        hasArButton: !!mv.querySelector('[slot="ar-button"]')
      };
    });

    expect(mvAttributes).not.toBeNull();
    expect(mvAttributes.hasAr).toBe(true);
    expect(mvAttributes.arScale).toBe('fixed'); // Enforces 1:1 metric scale!
    expect(mvAttributes.arPlacement).toBe('floor'); // Floor / tabletop hit testing!
    expect(mvAttributes.arModes).toContain('webxr');
    expect(mvAttributes.arModes).toContain('quick-look');
    expect(mvAttributes.src).toBe('/assets/models/appu_photoframe.glb');
    expect(mvAttributes.iosSrc).toBe('/assets/models/appu_photoframe.usdz');
    expect(mvAttributes.hasArButton).toBe(true);

    // 3. Verify .glb asset is reachable and returns HTTP 200
    const glbRes = await request.get('/assets/models/appu_photoframe.glb');
    expect(glbRes.status()).toBe(200);
    expect(Number(glbRes.headers()['content-length'])).toBeGreaterThan(1000000);

    // 4. Verify .usdz asset is reachable and returns HTTP 200 (for iOS Quick Look)
    const usdzRes = await request.get('/assets/models/appu_photoframe.usdz');
    expect(usdzRes.status()).toBe(200);
    expect(Number(usdzRes.headers()['content-length'])).toBeGreaterThan(1000000);

    // 5. Verify Zero critical runtime exceptions
    const criticalErrors = consoleErrors.filter(e => !e.includes('favicon'));
    expect(criticalErrors).toHaveLength(0);
  });
});
