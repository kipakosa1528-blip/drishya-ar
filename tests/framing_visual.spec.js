// Visual verification for video framing: proves the overlay is cropped to the
// target photo's aspect ratio (with zoom/pan) on the detail page and in the
// edit studio, and that the shared framing math produces the AR crop.
//
// Screenshots are written to test-results/visual/ (gitignored) so a human can
// eyeball the result without scanning on a phone.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures');
const OUT_DIR = path.join(process.cwd(), 'test-results', 'visual');

// Landscape target (real_target.jpg is 1542 x 791 ~ 1.95:1) vs a portrait
// 9:16 video is the classic mismatch that must be cropped to match the target.
const TARGET_W = 1542;
const TARGET_H = 791;
const PORTRAIT_VIDEO = '/assets/exhibition/boudhanath-stupa.mp4';

function mockAuthInit() {
  return () => {
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
  };
}

test.describe('Video framing visual verification', () => {

  test('detail page + edit studio frame the overlay to the target aspect', async ({ page }) => {
    test.skip(!fs.existsSync(path.join(FIXTURES, 'real_target.jpg')), 'real_target.jpg fixture missing');
    test.skip(!fs.existsSync(path.join(process.cwd(), 'assets', 'exhibition', 'boudhanath-stupa.mp4')), 'portrait video asset missing');

    fs.mkdirSync(OUT_DIR, { recursive: true });

    const imgBuf = fs.readFileSync(path.join(FIXTURES, 'real_target.jpg'));
    const imgData = 'data:image/jpeg;base64,' + imgBuf.toString('base64');

    let project = {
      id: 'vis-proj',
      name: 'Framing Visual Check',
      client: 'Demo',
      notes: '',
      expiresAt: null,
      maxScans: null,
      imageUrl: imgData,
      videoUrl: PORTRAIT_VIDEO,
      r2VideoUrl: PORTRAIT_VIDEO,
      video_path: 'vis/video.mp4',
      viewsCount: 0,
      target_data: {
        overlay_type: 'video',
        properties: { width: TARGET_W, height: TARGET_H },
        metadata: { width: TARGET_W, height: TARGET_H },
        overlay_framing: { ratio: 'target', zoom: 1, panX: 0, panY: 0, aspectRatio: TARGET_W / TARGET_H, planeW: 1, planeH: 0.5129 }
      }
    };

    await page.addInitScript(mockAuthInit());
    await page.addInitScript((p) => {
      localStorage.setItem('kipakosa_projects_cache', JSON.stringify([p]));
    }, project);

    await page.route('**/api/projects/vis-proj', async (route) => {
      if (route.request().method() === 'PUT') {
        const body = JSON.parse(route.request().postData() || '{}');
        if (body.overlayFraming) {
          project = { ...project, target_data: { ...project.target_data, overlay_framing: body.overlayFraming } };
        }
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(project) });
    });

    await page.goto('http://localhost:3000/project.html?id=vis-proj');
    await expect(page.locator('#p-title')).toHaveText('Framing Visual Check');

    // Wait for the framed preview to size itself against the real video metadata
    await page.waitForFunction(() => {
      const f = document.getElementById('preview-vid-frame');
      const v = document.getElementById('preview-vid');
      return f && f.offsetWidth > 0 && f.offsetHeight > 0 && v && v.videoWidth > 0;
    }, null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    await page.screenshot({ path: path.join(OUT_DIR, '01-project-detail-framed.png'), fullPage: true });

    // Open the edit modal and the framing studio
    await page.click('#edit-btn');
    await expect(page.locator('#edit-modal')).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT_DIR, '02-edit-modal-framed.png'), fullPage: true });

    await page.click('#e-btn-open-vid-studio');
    await expect(page.locator('#e-vid-studio-modal')).toBeVisible();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT_DIR, '03-edit-video-studio.png'), fullPage: true });

    // Prove the AR crop math: portrait video cropped to a landscape target.
    const proof = await page.evaluate(async () => {
      const mod = await import('/js/utils.js');
      const framing = { ratio: 'target', zoom: 1, panX: 0, panY: 0 };
      const tW = 1542, tH = 791;   // landscape target
      const vW = 720, vH = 1280;   // portrait video
      const uv = mod.framingToUV(framing, tW, tH, vW, vH);
      return {
        frameAspect: uv.frameAspect,
        targetAspect: uv.tAspect,
        repX: uv.repX,
        repY: uv.repY,
        matchesTarget: Math.abs(uv.frameAspect - uv.tAspect) < 1e-6
      };
    });
    expect(proof.matchesTarget).toBe(true);
    expect(proof.repY).toBeLessThan(1); // portrait video cropped vertically to fit landscape target
    expect(proof.repX).toBeCloseTo(1, 5);
    expect(proof.frameAspect).toBeCloseTo(TARGET_W / TARGET_H, 4);
  });
});
