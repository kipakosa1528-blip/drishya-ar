import { test, expect } from '@playwright/test';

test.describe('Multi-target Magazine Wizard Flow', () => {
  test('Step 1 validation and navigation to Step 2', async ({ page }) => {
    await page.goto('/createMagzine');
    
    // Step 1 is active initially
    await expect(page.locator('#sb-1')).toHaveClass(/active/);
    await expect(page.locator('#si-1')).toHaveClass(/active/);
    
    // Clicking next without name should trigger alert or stay on step 1
    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('name');
      await dialog.accept();
    });
    await page.locator('#btn-next-1').click();
    await expect(page.locator('#sb-1')).toHaveClass(/active/);

    // Enter name
    await page.locator('#f-name').fill('Test Wedding Magazine');
    await page.locator('#f-client').fill('Test Client');
    await page.locator('#btn-next-1').click();

    // Step 2 is now active
    await expect(page.locator('#sb-2')).toHaveClass(/active/);
    await expect(page.locator('#si-2')).toHaveClass(/active/);

    // Verify 1 target card exists by default
    await expect(page.locator('.target-builder-card')).toHaveCount(1);

    // Click "+ Add Another Target"
    await page.locator('#add-target-btn').click();
    await expect(page.locator('.target-builder-card')).toHaveCount(2);

    // Click Back to return to Step 1
    await page.locator('#sb-2 button:has-text("Back")').click();
    await expect(page.locator('#sb-1')).toHaveClass(/active/);
  });

  test('Magazines list and detail pages load properly', async ({ page }) => {
    await page.goto('/magnizes');
    await expect(page.locator('.page-title')).toContainText('Multi-Target Magazines');

    await page.goto('/magazine');
    await expect(page.locator('#not-found')).toBeVisible();
  });

  test('Multi-target AR viewer route validation', async ({ page }) => {
    // Missing ID returns 400
    const resNoId = await page.goto('/magAr');
    expect(resNoId.status()).toBe(400);

    // Unknown ID returns 404
    const res404 = await page.goto('/magAr?id=00000000-0000-0000-0000-000000000000');
    expect(res404.status()).toBe(404);
  });
});
