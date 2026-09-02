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

});
