import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/Saugat Shakya/.gemini/antigravity/brain/b1058997-007d-4c63-b7ba-3b07234be53c';

test.describe('Visual Screenshot Verification', () => {
  test('Capture Desktop & Mobile Screenshots of Demo and Pricing', async ({ page }) => {
    // 1. Desktop Viewport (1280 x 900)
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/landing', { waitUntil: 'networkidle' });

    // Scroll to #demo and take screenshot
    const demoSection = page.locator('#demo');
    await demoSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await demoSection.screenshot({ path: path.join(ARTIFACT_DIR, 'scratch_demo_desktop.png') });

    // Hide fixed nav for clean section captures
    await page.evaluate(() => {
      document.querySelectorAll('nav, .navbar, .glass-nav, header').forEach(el => {
        if (window.getComputedStyle(el).position === 'fixed') {
          el.style.visibility = 'hidden';
        }
      });
    });

    // Scroll to #pricing and take screenshot (Physical mode)
    const pricingSection = page.locator('#pricing');
    await pricingSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await pricingSection.screenshot({ path: path.join(ARTIFACT_DIR, 'scratch_pricing_desktop.png') });

    // Click digital tab and take screenshot (Digital mode)
    await page.click('#tier-tab-digital');
    await page.waitForTimeout(400);
    await pricingSection.screenshot({ path: path.join(ARTIFACT_DIR, 'scratch_pricing_digital.png') });

    // Switch back to physical
    await page.click('#tier-tab-physical');
    await page.waitForTimeout(400);

    // Capture payment pills specifically
    const paymentPills = page.locator('.payment-ordering-grid');
    if (await paymentPills.isVisible()) {
      await paymentPills.screenshot({ path: path.join(ARTIFACT_DIR, 'scratch_payment_pills.png') });
    }

    // Scroll to #exhibition and take screenshot (Desktop)
    const exhibitionSection = page.locator('#exhibition');
    await exhibitionSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await exhibitionSection.screenshot({ path: path.join(ARTIFACT_DIR, 'scratch_exhibition_desktop.png') });

    // 2. Mobile Viewport (iPhone 14 / 390 x 844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/landing', { waitUntil: 'networkidle' });

    const mobileExhibition = page.locator('#exhibition');
    await mobileExhibition.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await mobileExhibition.screenshot({ path: path.join(ARTIFACT_DIR, 'scratch_exhibition_mobile.png') });

    const mobileDemo = page.locator('#demo');
    await mobileDemo.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await mobileDemo.screenshot({ path: path.join(ARTIFACT_DIR, 'scratch_demo_mobile.png') });

    const mobilePricing = page.locator('#pricing');
    await mobilePricing.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await mobilePricing.screenshot({ path: path.join(ARTIFACT_DIR, 'scratch_pricing_mobile.png') });
  });
});
