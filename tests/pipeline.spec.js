import { test, expect } from '@playwright/test';

function mockAuthInit() {
  return () => {
    sessionStorage.setItem('kipakosa_config_cache', JSON.stringify({
      supabaseUrl: 'https://mock.supabase.co', supabaseAnonKey: 'mock', adminEmail: 'admin@kipakosa.app'
    }));
    window.supabase = {
      createClient: () => ({
        auth: {
          getSession: async () => ({ data: { session: { access_token: 'mock', user: { email: 'admin@kipakosa.app' } } } }),
          getUser: async () => ({ data: { user: { email: 'admin@kipakosa.app' } } }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          signOut: async () => {}
        }
      })
    };
  };
}

test.describe('Video pipeline (self-hosted transcode)', () => {

  test('detail page shows Optimized badge and serves the optimized URL', async ({ page }) => {
    const OPTIMIZED = 'https://pub-f2ad2c43aa344d4bb911e991b04b1fbd.r2.dev/pipe-proj/optimized.mp4';
    const project = {
      id: 'pipe-proj',
      name: 'Pipeline Check',
      client: '',
      notes: '',
      expiresAt: null,
      maxScans: null,
      overlayType: 'video',
      imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      videoUrl: OPTIMIZED,
      optimizedVideoUrl: OPTIMIZED,
      optimized_video_url: OPTIMIZED,
      transcodeStatus: 'ready',
      transcode_status: 'ready',
      videoBytes: 2 * 1024 * 1024,
      video_bytes: 2 * 1024 * 1024,
      viewsCount: 0,
      target_data: {
        overlay_type: 'video',
        properties: { width: 800, height: 1200 },
        metadata: { width: 800, height: 1200 },
        optimized_video_path: 'pipe-proj/optimized.mp4',
        transcode_status: 'ready',
        video_bytes: 2 * 1024 * 1024,
      }
    };

    await page.addInitScript(mockAuthInit());
    await page.addInitScript((p) => {
      localStorage.setItem('kipakosa_projects_cache', JSON.stringify([p]));
    }, project);
    await page.route('**/api/projects/pipe-proj', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(project) }));

    await page.goto('http://localhost:3000/project.html?id=pipe-proj');
    await expect(page.locator('#p-title')).toHaveText('Pipeline Check');

    const badge = page.locator('#vid-pipeline-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('Optimized for AR');

    const src = await page.locator('#preview-vid').getAttribute('src');
    expect(src).toBe(OPTIMIZED);
    expect(src).toContain('/optimized.mp4');
    expect(src).not.toContain('stream.mux.com');
  });

  test('detail page shows Optimizing badge while queued', async ({ page }) => {
    const project = {
      id: 'pipe-queued',
      name: 'Queued Check',
      client: '', notes: '', expiresAt: null, maxScans: null,
      overlayType: 'video',
      imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      videoUrl: 'https://pub-f2ad2c43aa344d4bb911e991b04b1fbd.r2.dev/pipe-queued/video.mp4',
      transcodeStatus: 'queued',
      transcode_status: 'queued',
      viewsCount: 0,
      target_data: { overlay_type: 'video', properties: { width: 800, height: 1200 }, metadata: { width: 800, height: 1200 }, transcode_status: 'queued' }
    };
    await page.addInitScript(mockAuthInit());
    await page.addInitScript((p) => { localStorage.setItem('kipakosa_projects_cache', JSON.stringify([p])); }, project);
    await page.route('**/api/projects/pipe-queued', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(project) }));

    await page.goto('http://localhost:3000/project.html?id=pipe-queued');
    await expect(page.locator('#p-title')).toHaveText('Queued Check');
    await expect(page.locator('#vid-pipeline-badge')).toContainText('Optimizing video');
  });
});
