import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Experience Editing & Asset Replacement Flow', () => {

  test('single frame project editing UI and API replacement', async ({ page }) => {
    page.on('console', msg => console.log('LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERR:', err));

    // 1. Mock auth & setup session
    await page.addInitScript(() => {
      sessionStorage.setItem('kipakosa_config_cache', JSON.stringify({
        supabaseUrl: 'https://mock.supabase.co',
        supabaseAnonKey: 'mock',
        adminEmail: 'admin@kipakosa.app'
      }));
      window.supabase = {
        createClient: () => ({
          auth: {
            getSession: async () => ({ data: { session: { access_token: 'mock-token', user: { email: 'admin@kipakosa.app' } } } }),
            getUser: async () => ({ data: { user: { email: 'admin@kipakosa.app' } } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
            signOut: async () => {}
          }
        })
      };
    });

    // Seed mock project in local cache
    let currentProj = {
      id: 'test-edit-proj',
      name: 'Original Frame Name',
      client: 'Original Client',
      notes: 'Original Notes',
      expiresAt: null,
      maxScans: 50,
      imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      videoUrl: 'https://test-stream.com/video.mp4',
      viewsCount: 12
    };

    await page.addInitScript((p) => {
      localStorage.setItem('kipakosa_projects_cache', JSON.stringify([p]));
    }, currentProj);

    // Mock API responses
    await page.route('**/api/projects/test-edit-proj', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentProj) });
      }
      if (route.request().method() === 'PUT') {
        const body = JSON.parse(route.request().postData() || '{}');
        currentProj = {
          ...currentProj,
          name: body.name || currentProj.name,
          client: body.client || currentProj.client,
          notes: body.notes || currentProj.notes,
          imageUrl: body.imageBase64 ? 'https://r2.mock/updated-img.jpg' : currentProj.imageUrl,
          videoUrl: body.videoBase64 ? 'https://stream.mux.com/mock-new-playback/high.mp4' : currentProj.videoUrl
        };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentProj) });
      }
      return route.continue();
    });

    await page.goto('http://localhost:3000/project.html?id=test-edit-proj');
    await expect(page.locator('#p-title')).toHaveText('Original Frame Name');

    // Open edit modal
    await page.click('#edit-btn');
    await expect(page.locator('#edit-modal')).toBeVisible();

    // Verify fields populated
    await expect(page.locator('#e-name')).toHaveValue('Original Frame Name');
    await expect(page.locator('#e-client')).toHaveValue('Original Client');

    // Modify details
    await page.fill('#e-name', 'Updated Frame Deluxe');
    await page.fill('#e-client', 'Client Supreme');
    await page.fill('#e-notes', 'Updated VIP notes');

    // Save changes
    await page.click('#save-edit-btn');

    // Assert modal closed & title updated on page
    await expect(page.locator('#edit-modal')).not.toBeVisible();
    await expect(page.locator('#p-title')).toHaveText('Updated Frame Deluxe');
    await expect(page.locator('#p-client')).toHaveText('Client Supreme');
  });

  test('multi-target magazine editing UI and page management', async ({ page }) => {
    // 1. Mock auth & session
    await page.addInitScript(() => {
      sessionStorage.setItem('kipakosa_config_cache', JSON.stringify({
        supabaseUrl: 'https://mock.supabase.co',
        supabaseAnonKey: 'mock',
        adminEmail: 'admin@kipakosa.app'
      }));
      window.supabase = {
        createClient: () => ({
          auth: {
            getSession: async () => ({ data: { session: { access_token: 'mock-token', user: { email: 'admin@kipakosa.app' } } } }),
            getUser: async () => ({ data: { user: { email: 'admin@kipakosa.app' } } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
            signOut: async () => {}
          }
        })
      };
    });

    let currentTestMag = {
      id: 'test-edit-mag',
      title: 'Original Mag Edition',
      issueNumber: 'Issue 1',
      client: 'Vogue',
      notes: 'Initial release',
      status: 'active',
      viewsCount: 5,
      targets: [
        {
          id: 'target_1',
          page_number: 1,
          target_name: 'Cover',
          image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          overlay: { type: 'video', url: 'https://stream.mux.com/playback1/high.mp4', duration: 30 }
        }
      ]
    };

    await page.route('**/api/magazines/test-edit-mag', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentTestMag) });
      }
      if (route.request().method() === 'PUT') {
        const body = JSON.parse(route.request().postData() || '{}');
        currentTestMag = {
          ...currentTestMag,
          title: body.title || currentTestMag.title,
          targets: body.targets || currentTestMag.targets
        };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentTestMag) });
      }
      return route.continue();
    });

    await page.goto('http://localhost:3000/magazine.html?id=test-edit-mag');
    await expect(page.locator('#p-title')).toHaveText('Original Mag Edition');
    await expect(page.locator('#p-target-count')).toHaveText('1');

    // Open Edit Magazine Studio
    await page.click('#edit-mag-btn');
    await expect(page.locator('#edit-mag-modal')).toBeVisible();

    // Verify fields
    await expect(page.locator('#emag-title')).toHaveValue('Original Mag Edition');
    await expect(page.locator('#emag-page-count')).toHaveText('1');

    // Add a new target page
    await page.click('#emag-add-page-btn');
    await expect(page.locator('#emag-page-count')).toHaveText('2');

    // Update title
    await page.fill('#emag-title', 'Spring Collection Magazine 2026');

    // Add page 2 with media file replacements
    await page.route('**/api/presign*', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'http://localhost:3000/mock-upload', publicUrl: 'http://localhost:3000/mock-file.jpg' })
      });
    });
    await page.route('**/mock-upload', async (route) => {
      return route.fulfill({ status: 200, body: 'ok' });
    });

    const dummyImg = Buffer.from('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    await page.setInputFiles('.row-img-input[data-idx="1"]', {
      name: 'page2.jpg',
      mimeType: 'image/jpeg',
      buffer: dummyImg
    });
    await page.setInputFiles('.row-overlay-input[data-idx="1"]', {
      name: 'page2_overlay.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('dummy-video-content')
    });

    await page.waitForTimeout(500);
    if (await page.locator('#emag-vid-studio-modal').isVisible()) {
      await page.click('#emag-confirm-vid-framing');
    }

    // Save changes with new files uploaded directly to R2
    await page.click('#save-edit-mag-btn');

    // Verify modal closes and detail page refreshes without any errors
    await expect(page.locator('#edit-mag-modal')).not.toBeVisible();
    await expect(page.locator('#p-title')).toHaveText('Spring Collection Magazine 2026');
  });

  test('applying video framing auto-persists it to the project', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('kipakosa_config_cache', JSON.stringify({
        supabaseUrl: 'https://mock.supabase.co',
        supabaseAnonKey: 'mock',
        adminEmail: 'admin@kipakosa.app'
      }));
      window.supabase = {
        createClient: () => ({
          auth: {
            getSession: async () => ({ data: { session: { access_token: 'mock-token', user: { email: 'admin@kipakosa.app' } } } }),
            getUser: async () => ({ data: { user: { email: 'admin@kipakosa.app' } } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
            signOut: async () => {}
          }
        })
      };
    });

    let savedFraming = null;
    const targetImg = fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'real_target.jpg'));
    const targetDataUrl = 'data:image/jpeg;base64,' + targetImg.toString('base64');
    // real_target.jpg is 1542 x 791
    const TARGET_ASPECT = 1542 / 791;
    let project = {
      id: 'framing-persist-proj',
      name: 'Framing Persist',
      client: '',
      notes: '',
      expiresAt: null,
      maxScans: null,
      imageUrl: targetDataUrl,
      videoUrl: 'https://test-stream.com/video.mp4',
      viewsCount: 0,
      target_data: { overlay_type: 'video', properties: { width: 1542, height: 791 }, metadata: { width: 1542, height: 791 } }
    };

    await page.addInitScript((p) => {
      localStorage.setItem('kipakosa_projects_cache', JSON.stringify([p]));
    }, project);

    await page.route('**/api/projects/framing-persist-proj', async (route) => {
      if (route.request().method() === 'PUT') {
        const body = JSON.parse(route.request().postData() || '{}');
        if (body.overlayFraming) {
          savedFraming = body.overlayFraming;
          project = { ...project, target_data: { ...project.target_data, overlay_framing: body.overlayFraming } };
        }
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(project) });
    });

    await page.goto('http://localhost:3000/project.html?id=framing-persist-proj');
    await expect(page.locator('#p-title')).toHaveText('Framing Persist');

    await page.click('#edit-btn');
    await expect(page.locator('#edit-modal')).toBeVisible();

    await page.click('#e-btn-open-vid-studio');
    await expect(page.locator('#e-vid-studio-modal')).toBeVisible();

    // Apply the default "Match Target Photo" framing
    await page.click('#e-confirm-vid-framing');

    await expect.poll(() => savedFraming && savedFraming.ratio).toBe('target');
    expect(Math.abs(savedFraming.aspectRatio - TARGET_ASPECT)).toBeLessThan(0.02);
    expect(savedFraming.planeW).toBeGreaterThan(0);
    expect(savedFraming.planeH).toBeGreaterThan(0);
  });

});
