import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://localhost:3000' });

test.describe('Kipakosa AR Landing Page Test Suite', () => {

  // ─────────────────────────────────────────────────────────────────────────────
  // (1) GET `/` renders the landing page (nav, hero, products grid present)
  // ─────────────────────────────────────────────────────────────────────────────
  test('GET / renders the landing page with nav, hero, products grid, presence, and footer', async ({ page }) => {
    await page.goto('/');

    // 1. Title & Meta
    await expect(page).toHaveTitle(/Kipakosa AR/);

    // 2. Navigation
    const nav = page.locator('header.nav-wrap');
    await expect(nav).toBeVisible();
    await expect(nav.locator('.brand-link')).toContainText('Kipakosa');
    await expect(nav.locator('.brand-badge')).toHaveText('AR');
    await expect(nav.locator('.nav-menu a[href="#how-it-works"]')).toBeVisible();
    await expect(nav.locator('.nav-menu a[href="#products"]')).toBeVisible();
    await expect(nav.locator('.nav-menu a[href="#presence"]')).toBeVisible();
    await expect(nav.locator('.nav-menu a[href="#testimonials"]')).toBeVisible();
    await expect(nav.locator('.nav-menu a[href="#contact"]')).toBeVisible();
    await expect(nav.locator('a[href="/admin.html"]')).toBeVisible();

    // 3. Hero Section
    const hero = page.locator('section#hero');
    await expect(hero).toBeVisible();
    await expect(hero.locator('h1.hero-title')).toContainText('Turn Any Physical Image Into an');
    await expect(hero.locator('h1.hero-title .text-gradient')).toContainText('AR Experience');
    await expect(hero.locator('.hero-ctas a[href="#products"]')).toBeVisible();
    await expect(hero.locator('.hero-ctas a[href="#how-it-works"]')).toBeVisible();
    await expect(hero.locator('.hero-demo-card')).toBeVisible();

    // 4. How It Works Section (3 steps)
    const howItWorks = page.locator('section#how-it-works');
    await expect(howItWorks).toBeVisible();
    const stepCards = howItWorks.locator('.reveal-card.step-card');
    await expect(stepCards).toHaveCount(3);
    await expect(stepCards.nth(0)).toContainText('Upload Image Target');
    await expect(stepCards.nth(1)).toContainText('Attach Dynamic Video');
    await expect(stepCards.nth(2)).toContainText('Point & Scan to Reveal');

    // 5. Products Grid (6 signature solutions)
    const productsSec = page.locator('section#products');
    await expect(productsSec).toBeVisible();
    const productCards = productsSec.locator('.products-grid .reveal-card');
    await expect(productCards).toHaveCount(6);

    const expectedProducts = [
      'Product Packaging',
      'Business Cards & Print',
      'Posters & Wall Signage',
      'Menus & Gourmet Labels',
      'Billboards & Outdoor Media',
      'Events, Badges & Merch'
    ];

    for (let i = 0; i < expectedProducts.length; i++) {
      await expect(productCards.nth(i).locator('.reveal-title')).toHaveText(expectedProducts[i]);
    }

    // 6. Presence & Partner Ecosystem
    const presence = page.locator('section#presence');
    await expect(presence).toBeVisible();
    await expect(presence.locator('.presence-stats-strip')).toBeVisible();
    await expect(presence.locator('.partner-logos .partner-logo-item')).toHaveCount(6);

    // 7. Testimonials, Contact CTA & Footer
    await expect(page.locator('section#testimonials .testimonial-card')).toHaveCount(3);
    await expect(page.locator('section#contact .cta-banner')).toBeVisible();
    await expect(page.locator('footer.footer')).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (2) Desktop hover-reveal: hovering a `.reveal-card` activates visual reveal state
  // ─────────────────────────────────────────────────────────────────────────────
  test('Desktop hover-reveal: hovering a .reveal-card activates visual reveal state', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const firstProductCard = page.locator('.products-grid .reveal-card').first();
    await firstProductCard.scrollIntoViewIfNeeded();

    const overlay = firstProductCard.locator('.reveal-overlay');
    const svgPreview = firstProductCard.locator('.reveal-preview-svg');

    // Baseline state before hover
    const initialOverlayOpacity = await overlay.evaluate(el => window.getComputedStyle(el).opacity);
    expect(parseFloat(initialOverlayOpacity)).toBeLessThanOrEqual(0.7);

    const initialFilter = await svgPreview.evaluate(el => window.getComputedStyle(el).filter);
    expect(initialFilter).toMatch(/grayscale|blur/i);

    // Perform hover
    await firstProductCard.hover();
    await page.waitForTimeout(400); // Allow CSS transition to complete

    // State during hover
    const hoveredOverlayOpacity = await overlay.evaluate(el => window.getComputedStyle(el).opacity);
    expect(parseFloat(hoveredOverlayOpacity)).toBeGreaterThanOrEqual(0.95);

    const hoveredFilter = await svgPreview.evaluate(el => window.getComputedStyle(el).filter);
    expect(hoveredFilter).toMatch(/none|blur\(0px\)|grayscale\(0\)/i);

    // Reveal action button text becomes fully visible
    await expect(firstProductCard.locator('.reveal-action')).toBeVisible();
    await expect(firstProductCard.locator('.reveal-action')).toContainText('+400% Customer Engagement');

    // Move mouse away (unhover)
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);

    const unhoveredOverlayOpacity = await overlay.evaluate(el => window.getComputedStyle(el).opacity);
    expect(parseFloat(unhoveredOverlayOpacity)).toBeLessThanOrEqual(0.7);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (3) Mobile / touch fallback: tap-to-reveal pattern works without hover
  // ─────────────────────────────────────────────────────────────────────────────
  test('Mobile/touch fallback: tap-to-reveal reveals card content on tap and handles outside dismiss', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const productCards = page.locator('.products-grid .reveal-card');
    const card1 = productCards.nth(0);
    const card2 = productCards.nth(1);

    await card1.scrollIntoViewIfNeeded();

    // Initial state: not revealed
    await expect(card1).not.toHaveClass(/is-revealed/);

    // 1st Tap on card 1 -> reveals it
    await card1.click();
    await expect(card1).toHaveClass(/is-revealed/);
    await page.waitForTimeout(400); // Allow CSS transition to complete

    // Verify computed styles when .is-revealed is active
    const revealedOverlayOpacity = await card1.locator('.reveal-overlay').evaluate(el => window.getComputedStyle(el).opacity);
    expect(parseFloat(revealedOverlayOpacity)).toBeGreaterThanOrEqual(0.95);

    const revealedFilter = await card1.locator('.reveal-preview-svg').evaluate(el => window.getComputedStyle(el).filter);
    expect(revealedFilter).toMatch(/none|blur\(0px\)|grayscale\(0\)/i);

    // Tap on card 2 -> card 1 collapses, card 2 reveals
    await card2.scrollIntoViewIfNeeded();
    await card2.click();
    await expect(card1).not.toHaveClass(/is-revealed/);
    await expect(card2).toHaveClass(/is-revealed/);

    // Tap outside (e.g. on the section header) -> card 2 collapses
    await page.locator('#products .section-title').click();
    await expect(card2).not.toHaveClass(/is-revealed/);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (4) Admin routes: `/admin.html` and `/index.html` show admin login (redirect works)
  // ─────────────────────────────────────────────────────────────────────────────
  test('Admin routes: /admin.html renders admin login and /index.html redirects to /admin.html', async ({ page }) => {
    // Test direct navigation to /admin.html
    await page.goto('/admin.html');
    await expect(page.locator('.brand')).toContainText('Kipakosa');
    await expect(page.locator('.brand span')).toHaveText('ADMIN');
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('#pw')).toBeVisible();
    await expect(page.locator('#login-btn')).toBeVisible();

    // Test bookmark redirect: /index.html -> /admin.html
    await page.goto('/index.html');
    await page.waitForURL('/admin.html');
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('#pw')).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (5) Accessibility: `prefers-reduced-motion` mode does not break rendering
  // ─────────────────────────────────────────────────────────────────────────────
  test('Accessibility: prefers-reduced-motion mode renders static reveals cleanly without broken layout', async ({ page }) => {
    // Enable reduced motion media feature
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    // Page must render completely
    await expect(page.locator('h1.hero-title')).toBeVisible();
    await expect(page.locator('.products-grid .reveal-card')).toHaveCount(6);

    const firstProductCard = page.locator('.products-grid .reveal-card').first();
    const svgPreview = firstProductCard.locator('.reveal-preview-svg');
    const overlay = firstProductCard.locator('.reveal-overlay');

    // In reduced motion mode, blur is disabled by default in CSS rules
    const filter = await svgPreview.evaluate(el => window.getComputedStyle(el).filter);
    expect(filter).toMatch(/none|blur\(0px\)|grayscale\(0\)/i);

    // Overlays remain accessible and fully opaque
    const overlayOpacity = await overlay.evaluate(el => window.getComputedStyle(el).opacity);
    expect(parseFloat(overlayOpacity)).toBeGreaterThanOrEqual(0.95);

    // Check that partner logos are clearly visible in reduced motion mode
    const partnerItem = page.locator('.partner-logos .partner-logo-item').first();
    await expect(partnerItem).toBeVisible();
  });

});
