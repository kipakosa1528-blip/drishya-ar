// 3D overlay (GLB) optimisation + lazy loading regression tests.
// Runs against the local server (real DB). Skips if the 3D project is gone.

import { test, expect } from '@playwright/test';

const PROJECT_ID = process.env.TEST_3D_PROJECT_ID || '051d27da-9b16-4698-9257-7f0c396d91da';

test.describe('3D model optimisation', () => {
  test('AR 3D page lazy-loads the model and serves the optimized GLB', async ({ request }) => {
    const res = await request.get(`/ar?id=${PROJECT_ID}`);
    test.skip(res.status() >= 400, '3D project not available');
    const html = await res.text();

    // No <a-asset-item> preload (that used to block the camera on the whole GLB).
    expect(html).not.toContain('a-asset-item');
    expect(html).not.toContain('ar-model-asset');

    // The model is loaded lazily from the optimized file.
    expect(html).toContain('AR_MODEL_URL');
    expect(html).toContain('optimized.glb');

    // The model entity starts without a gltf-model; it is attached on xrimagefound.
    expect(html).toMatch(/id="ar-model"[^>]*>/);
    expect(html).not.toMatch(/id="ar-model"[^>]*gltf-model=/);
  });

  test('project API prefers the optimized model url', async ({ request }) => {
    const res = await request.get(`/api/projects/${PROJECT_ID}`);
    test.skip(res.status() >= 400, 'project not available');
    const p = await res.json();
    if (p.overlayType === '3d') {
      expect(p.modelUrl).toContain('optimized.glb');
      expect(p.transcodeStatus).toBe('ready');
    }
  });

  test('AR 3D viewer supports conditional animated rotation (spin-axis)', async () => {
    const { renderArPage } = await import('../server/views/ar-viewer.js');

    // 1. Earth model demo keeps animated rotation by default
    const earthHtml = renderArPage({
      name: 'Earth Demo',
      overlayType: '3d',
      modelUrl: 'https://r2.mock/earth/model.glb',
      targetData: { model_path: '051d27da-9b16-4698-9257-7f0c396d91da/model.glb' },
      planeW: 1.0, planeH: 1.0
    });
    expect(earthHtml).toMatch(/id="ar-model"[^>]*spin-axis/);

    // 2. Standard 3D model (e.g. photoframe, car, character) does NOT spin involuntarily
    const staticModelHtml = renderArPage({
      name: 'Product Showcase',
      overlayType: '3d',
      modelUrl: 'https://r2.mock/product/model.glb',
      targetData: { model_path: 'mock/product.glb' },
      planeW: 1.0, planeH: 1.0
    });
    expect(staticModelHtml).not.toMatch(/id="ar-model"[^>]*spin-axis/);

    // 3. Explicit auto_rotate: true enables spin-axis on any model
    const explicitSpinHtml = renderArPage({
      name: 'Custom Rotating Product',
      overlayType: '3d',
      modelUrl: 'https://r2.mock/product/model.glb',
      targetData: { auto_rotate: true, rotation_speed: 45 },
      planeW: 1.0, planeH: 1.0
    });
    expect(explicitSpinHtml).toContain('spin-axis="speed: 45"');

    // 4. Configurable model container rotation
    const customRotHtml = renderArPage({
      name: 'Flat Lay Model',
      overlayType: '3d',
      modelUrl: 'https://r2.mock/product/model.glb',
      targetData: { model_settings: { rotation: '0 0 0' } },
      planeW: 1.0, planeH: 1.0
    });
    expect(customRotHtml).toContain('rotation="0 0 0"');
  });
});
