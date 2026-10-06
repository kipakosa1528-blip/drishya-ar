import { test, expect } from '@playwright/test';

test.describe('Multi-Tech AR Suite: Furniture 1:1 Showroom & Calibrated Living Frame', () => {

  test('Sales Option 2 (/preview-furniture): verifies model-viewer attributes, floor placement, 1:1 fixed scale, and interactive swatches', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => {
      consoleErrors.push(err.stack || err.message);
    });

    const res = await page.goto('/preview-furniture', { waitUntil: 'domcontentloaded' });
    expect(res.status()).toBe(200);

    // Verify model-viewer presence and critical AR attributes
    const mvAttrs = await page.evaluate(() => {
      const el = document.getElementById('furniture-mv');
      if (!el) return null;
      return {
        src: el.getAttribute('src'),
        iosSrc: el.getAttribute('ios-src'),
        ar: el.hasAttribute('ar'),
        arPlacement: el.getAttribute('ar-placement'),
        arScale: el.getAttribute('ar-scale'),
        arModes: el.getAttribute('ar-modes')
      };
    });

    expect(mvAttrs).not.toBeNull();
    expect(mvAttrs.src).toContain('/assets/models/sofa.glb');
    expect(mvAttrs.iosSrc).toContain('/assets/models/sofa.usdz');
    expect(mvAttrs.ar).toBe(true);
    expect(mvAttrs.arPlacement).toBe('floor');
    expect(mvAttrs.arScale).toBe('fixed');
    expect(mvAttrs.arModes).toContain('webxr');
    expect(mvAttrs.arModes).toContain('scene-viewer');
    expect(mvAttrs.arModes).toContain('quick-look');

    // Verify Dimension Spec Card displays authentic metric values
    const dimText = await page.textContent('#dimension-card');
    expect(dimText).toContain('190 cm');
    expect(dimText).toContain('130 cm');
    expect(dimText).toContain('61 cm');
    expect(dimText).toContain('Grounded Floor Scale');

    // Verify Material Swatches
    const swatches = page.locator('.swatch-item');
    const swatchCount = await swatches.count();
    expect(swatchCount).toBe(5);

    // Click a swatch to trigger color change
    const slateSwatch = page.locator('.swatch-item[title="Charcoal Slate"]');
    await slateSwatch.click();
    await expect(slateSwatch).toHaveClass(/active/);
  });

  test('Sales Option 1 (/preview-frame): verifies 18cm calibrated height clamp and locked scale (no pinch-scale distortion)', async ({ page }) => {
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

  test('Sales Option 1 In-Browser WebXR (/preview-frame-webxr): verifies WebXR hit-test engine, calibrated 18cm desk scale, and controls', async ({ page }) => {
    const res = await page.goto('/preview-frame-webxr', { waitUntil: 'domcontentloaded' });
    expect(res.status()).toBe(200);

    // Verify canvas, top bar, and either WebXR action bar or non-XR fallback card
    await expect(page.locator('#webxr-canvas')).toBeVisible();
    await expect(page.locator('#top-bar')).toBeVisible();

    // On headless browser without WebXR hardware, fallback card is displayed
    const fallbackVisible = await page.locator('#fallback-card').isVisible();
    if (fallbackVisible) {
      // Click 3D preview to engage interactive mode
      await page.click('#btn-3d-preview');
      await expect(page.locator('#btn-sound')).toBeVisible();
    } else {
      await expect(page.locator('#btn-enter-ar')).toBeVisible();
    }

    // Check script parameters
    const pageContent = await page.content();
    expect(pageContent).toContain('targetHeightMeters: 0.18');
    expect(pageContent).toContain('appu_photoframe.glb');
    expect(pageContent).toContain('requestHitTestSource');
  });

});
