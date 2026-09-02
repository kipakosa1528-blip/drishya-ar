import { test, expect } from '@playwright/test';

test('Render 3D Revolving Earth Model and capture screenshots', async ({ page }) => {
  await page.goto('http://localhost:3000/earth_3d_test.html');

  // Wait for 3D canvases to render
  await page.waitForSelector('#canvas-container canvas');
  await page.waitForSelector('#ar-sim-container canvas');

  // Wait 2.5 seconds for textures to load & earth to begin revolving
  await page.waitForTimeout(2500);

  // Capture main page overview screenshot
  await page.screenshot({
    path: 'C:/Users/Saugat Shakya/.gemini/antigravity/brain/b1058997-007d-4c63-b7ba-3b07234be53c/3d_earth_overview.png',
    fullPage: true
  });

  // Capture Close-up 1: Earth Model View
  const viewer1 = page.locator('#canvas-container');
  await viewer1.screenshot({
    path: 'C:/Users/Saugat Shakya/.gemini/antigravity/brain/b1058997-007d-4c63-b7ba-3b07234be53c/3d_earth_model_frame1.png'
  });

  // Capture Close-up 2: AR Photo Frame Anchored Simulation
  const viewer2 = page.locator('#ar-sim-container');
  await viewer2.screenshot({
    path: 'C:/Users/Saugat Shakya/.gemini/antigravity/brain/b1058997-007d-4c63-b7ba-3b07234be53c/3d_earth_ar_frame_overlay.png'
  });

  // Wait another 2.5 seconds to capture rotation progression
  await page.waitForTimeout(2500);
  await viewer1.screenshot({
    path: 'C:/Users/Saugat Shakya/.gemini/antigravity/brain/b1058997-007d-4c63-b7ba-3b07234be53c/3d_earth_model_frame2_rotated.png'
  });
});
