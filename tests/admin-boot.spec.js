// Permanent regression specs for js/admin-boot.js (pre-paint hydration).
// Runs fully credential-free: KBoot is exercised directly on the public
// landing page via addScriptTag, plus static checks on the admin shells.

import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://localhost:3000' });

test.describe('admin-boot', () => {
  test('is served with caching headers and exposes window.KBoot', async ({ page, request }) => {
    const res = await request.get('/js/admin-boot.js?v=1');
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toContain('max-age=300');

    await page.goto('/');
    await page.addScriptTag({ url: '/js/admin-boot.js?v=1' });
    expect(await page.evaluate(() => typeof window.KBoot)).toBe('object');
    expect(await page.evaluate(() => typeof window.KBoot.readCache)).toBe('function');
  });

  test('readCache returns null on garbage and arrays on valid cache', async ({ page }) => {
    await page.goto('/');
    await page.addScriptTag({ url: '/js/admin-boot.js?v=1' });
    const out = await page.evaluate(() => {
      localStorage.removeItem('kipakosa_projects_cache');
      const miss = KBoot.readCache();
      localStorage.setItem('kipakosa_projects_cache', 'not-json{');
      const garbage = KBoot.readCache();
      localStorage.setItem('kipakosa_projects_cache', JSON.stringify([{ id: 'a' }]));
      const hit = KBoot.readCache();
      localStorage.setItem('kipakosa_projects_cache', '{"nope":true}');
      const nonArray = KBoot.readCache();
      localStorage.removeItem('kipakosa_projects_cache');
      return { miss, garbage, hit, nonArray };
    });
    expect(out.miss).toBeNull();
    expect(out.garbage).toBeNull();
    expect(Array.isArray(out.hit)).toBe(true);
    expect(out.nonArray).toBeNull();
  });

  test('rowHTML escapes hostile values (XSS-safe hydration)', async ({ page }) => {
    await page.goto('/');
    await page.addScriptTag({ url: '/js/admin-boot.js?v=1' });
    const html = await page.evaluate(() => KBoot.rowHTML({
      id: 'p"<script>',
      name: '<img src=x onerror=alert(1)>',
      client: 'A & B',
      views_count: 3,
      image_url: '',
    }));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('project.html?id=');
    expect(html).not.toContain('</script>');
  });

  test('statusBadge mirrors expiry and scan-limit states', async ({ page }) => {
    await page.goto('/');
    await page.addScriptTag({ url: '/js/admin-boot.js?v=1' });
    const states = await page.evaluate(() => ({
      active: KBoot.statusBadge({}),
      limited: KBoot.statusBadge({ max_scans: 5, views_count: 5 }),
      limitedOpen: KBoot.statusBadge({ max_scans: 5, views_count: 2 }),
      expired: KBoot.statusBadge({ expires_at: new Date(Date.now() - 86400000).toISOString() }),
    }));
    expect(states.active).toContain('badge-green');
    expect(states.limited).toContain('Limit Reached');
    expect(states.limitedOpen).toContain('Active (2/5)');
    expect(states.expired).toContain('Time Expired');
  });

  test('skeletonRows emits the requested number of rows', async ({ page }) => {
    await page.goto('/');
    await page.addScriptTag({ url: '/js/admin-boot.js?v=1' });
    const count = await page.evaluate(() => {
      const html = KBoot.skeletonRows(4);
      const tmp = document.createElement('tbody');
      tmp.innerHTML = html;
      return tmp.querySelectorAll('tr').length;
    });
    expect(count).toBe(4);
  });

  test('hover prefetch links internal admin pages only', async ({ page }) => {
    await page.goto('/');
    await page.addScriptTag({ url: '/js/admin-boot.js?v=1' });
    await page.evaluate(() => {
      const mk = (href) => {
        const a = document.createElement('a');
        a.href = href;
        a.textContent = 'x';
        document.body.appendChild(a);
        a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      };
      mk('/projects.html');
      mk('/dashboard.html');
      mk('https://evil.example/dashboard.html');
    });
    expect(await page.locator('link[rel="prefetch"][href="/projects.html"]').count()).toBe(1);
    expect(await page.locator('link[rel="prefetch"][href="/dashboard.html"]').count()).toBe(1);
    expect(await page.locator('link[rel="prefetch"]').count()).toBe(2); // external ignored
  });

  test('admin shells ship the boot script and hydration snippet', async ({ request }) => {
    for (const pagePath of ['/dashboard.html', '/projects.html', '/project.html', '/create.html']) {
      const res = await request.get(pagePath);
      expect(res.status(), pagePath).toBe(200);
      const html = await res.text();
      expect(html, pagePath).toContain('js/admin-boot.js');
    }
    const dash = await (await request.get('/dashboard.html')).text();
    expect(dash).toContain('KBoot.readCache()');
    const proj = await (await request.get('/project.html')).text();
    expect(proj).toContain("location.search).get('id')");
  });
});
