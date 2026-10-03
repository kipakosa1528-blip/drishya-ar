import { test, expect } from '@playwright/test';
import { renderArPage } from '../server/views/ar-viewer.js';
import { renderMagazineArPage } from '../server/views/magazine-viewer.js';

test.describe('Regression Prevention Guards', () => {

  test('WebAR viewer HTML template never has autoplay on video tag', () => {
    const html = renderArPage({
      name: 'Test Project',
      videoUrl: 'https://example.com/test.mp4',
      targetData: { properties: { width: 640, height: 640 } },
      planeW: 1,
      planeH: 1,
      tW: 640,
      tH: 640,
    });

    // The <video id="ar-video"> tag must NOT have autoplay attribute
    expect(html).not.toMatch(/<video[^>]*\sautoplay/i);
    // Must contain targetActive lock logic
    expect(html).toContain('var targetActive = false;');
    expect(html).toContain('if (!video || !targetActive) return;');
  });

  test('Multi-target Magazine AR viewer template never has autoplay on video tags', () => {
    const html = renderMagazineArPage({
      title: 'Test Magazine',
      magId: '123',
      targets: [
        { targetName: 'target0', overlayType: 'video', overlayUrl: 'https://example.com/test.mp4' }
      ]
    });

    expect(html).not.toMatch(/<video[^>]*\sautoplay/i);
  });

  test('All public funnel & legal routes return 200 OK', async ({ request }) => {
    const endpoints = [
      '/',
      '/order',
      '/demo',
      '/bio',
      '/privacy',
      '/terms',
      '/refund',
      '/cookies',
      '/acceptable-use',
      '/robots.txt',
      '/sitemap.xml'
    ];

    for (const ep of endpoints) {
      const res = await request.get(ep);
      expect(res.status(), `Route ${ep} should return 200`).toBe(200);
    }
  });

});
