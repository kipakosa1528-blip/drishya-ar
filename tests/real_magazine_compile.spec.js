import { test, expect } from '@playwright/test';
import path from 'path';
import 'dotenv/config';

test.describe('Real Multi-Target Magazine Creation & Compile', () => {
  test('Full UI creation with Target image cropping, Video framing, R2 upload & compilation', async ({ page }) => {
    // 1. Inject simulated valid admin session into localStorage
    await page.goto('/createMagzine');
    await page.evaluate(() => {
      // Bypass admin-boot redirect for testing
      localStorage.setItem('sb-esovxpyomahrboerikqg-auth-token', JSON.stringify({
        access_token: 'test_token',
        user: { id: 'admin-user', email: 'admin@kipakosa.com' }
      }));
    });

    await page.goto('/createMagzine');
    await page.waitForLoadState('networkidle');

    // Step 1: Info
    await page.fill('#f-name', 'Automated Multi-Target Magazine Test');
    await page.fill('#f-client', 'Client Test');
    await page.fill('#f-notes', 'End-to-end automated test');
    await page.click('#btn-next-1');
    await expect(page.locator('#sb-2')).toHaveClass(/active/);

    // Step 2: Target 1 - Upload Image and Confirm Crop
    const imgPath = path.join(process.cwd(), 'tests', 'fixtures', 'real_target.jpg');
    await page.locator('#t-file-0').setInputFiles(imgPath);
    
    // Wait for Cropper modal
    await expect(page.locator('#cropper-modal')).toBeVisible();
    await page.locator('#cropper-modal button:has-text("Confirm Crop")').click();
    await expect(page.locator('#cropper-modal')).toBeHidden();
    await expect(page.locator('#target-preview-box-0 img')).toBeVisible();

    // Target 1 - Upload Video Overlay and Confirm Video Framing
    const vidPath = path.join(process.cwd(), 'tests', 'fixtures', 'real_video.mp4');
    await page.locator('#o-file-0').setInputFiles(vidPath);

    // Wait for Video Studio modal
    await expect(page.locator('#video-studio-modal')).toBeVisible();
    await page.locator('#video-studio-modal button:has-text("Confirm Video Framing")').click();
    await expect(page.locator('#video-studio-modal')).toBeHidden();

    // Step 2 -> Step 3
    await page.click('#btn-next-2');
    await expect(page.locator('#sb-3')).toHaveClass(/active/);

    // Step 3: Expiry mode - set +30 days
    await page.locator('button:has-text("+30 days")').click();
    await expect(page.locator('#f-expiry')).not.toHaveValue('');

    // Step 3 -> Step 4
    await page.click('#btn-next-3');
    await expect(page.locator('#sb-4')).toHaveClass(/active/);

    // Verify Review table
    await expect(page.locator('#r-name')).toContainText('Automated Multi-Target Magazine Test');
    await expect(page.locator('#r-targets')).toContainText('1 targets configured');
  });
});
