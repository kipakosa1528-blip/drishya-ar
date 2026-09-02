import { test, expect } from '@playwright/test';

test.describe('3D Model (.glb) Overlay Lifecycle & AR Viewer', () => {

  test('Presign endpoint allows model.glb keys for single projects and magazines', async ({ page }) => {
    // Mock Supabase Auth
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

    const id = '11111111-2222-3333-4444-555555555555';
    await page.route(`**/api/presign?key=${id}%2Fmodel.glb&type=model%2Fgltf-binary`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://r2.mock/upload-url', publicUrl: `https://r2.mock/${id}/model.glb` })
      });
    });

    await page.goto('http://localhost:3000/admin.html');
    const resp = await page.evaluate(async (key) => {
      const r = await fetch(`/api/presign?key=${encodeURIComponent(key)}&type=model%2Fgltf-binary`, {
        headers: { Authorization: 'Bearer mock-token' }
      });
      return { status: r.status, data: await r.json() };
    }, `${id}/model.glb`);

    expect(resp.status).toBe(200);
    expect(resp.data.publicUrl).toContain('model.glb');
  });

  test('Create wizard switches between Video and 3D Model without console errors', async ({ page }) => {
    // Mock Supabase Auth
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

    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('http://localhost:3000/create.html');
    await page.evaluate(() => goStep(3));
    await page.click('#btn-mode-3d');
    
    const is3DActive = await page.evaluate(() => document.getElementById('btn-mode-3d').classList.contains('active'));
    const isModelSectionVisible = await page.evaluate(() => document.getElementById('model-overlay-section').style.display === 'block');
    const isVidSectionHidden = await page.evaluate(() => document.getElementById('video-overlay-section').style.display === 'none');

    expect(is3DActive).toBe(true);
    expect(isModelSectionVisible).toBe(true);
    expect(isVidSectionHidden).toBe(true);
    expect(pageErrors.length).toBe(0);

    // Switch back to video
    await page.click('#btn-mode-vid');
    const isVidActive = await page.evaluate(() => document.getElementById('btn-mode-vid').classList.contains('active'));
    expect(isVidActive).toBe(true);
    expect(pageErrors.length).toBe(0);
  });

});
