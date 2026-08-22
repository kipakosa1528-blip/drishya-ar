// Kipakosa AR — server entry point.
// Wires static pages, the projects API, presigned uploads and the public
// AR viewer. Route/view logic lives under server/; this file stays thin so
// Vercel's single-function deployment keeps working.

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { supabase } from './server/lib/clients.js';
import { makeRequireAuth } from './server/lib/security.js';
import { registerProjectsRoutes } from './server/routes/projects.js';
import { registerMiscRoutes } from './server/routes/misc.js';
import { registerArRoute } from './server/routes/ar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const requireAuth = makeRequireAuth(supabase);

app.use(express.json({ limit: '1mb' }));

// ── Security headers ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  next();
});

// ── Pages ─────────────────────────────────────────────────────────────────────
for (const route of ['/', '/landing']) {
  app.get(route, (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.sendFile(path.join(__dirname, 'landing.html'));
  });
}

// Static assets served ONLY from whitelisted directories — never the repo root,
// so local files like .env / server source are not exposed over HTTP.
// Short max-age + stale-while-revalidate keeps repeat navigations off the
// serverless function while bounding post-deploy staleness to ~5 minutes.
for (const dir of ['assets', 'css', 'js', 'external']) {
  app.use(`/${dir}`, express.static(path.join(__dirname, dir), {
    index: false,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    },
  }));
}

// Explicit routes for each page (keeps bookmarked .html URLs working)
for (const page of [
  'landing.html', 'index.html', 'admin.html', 'create.html',
  'dashboard.html', 'projects.html', 'project.html', 'ar.html',
]) {
  app.get(`/${page}`, (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.sendFile(path.join(__dirname, page));
  });
}

// Explicit logo route with correct image/svg+xml header
app.get('/assets/logo.svg', (req, res) => {
  const logoPath = path.join(__dirname, 'assets', 'logo.svg');
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(logoPath);
});

// Root favicon fallback: browsers auto-request /favicon.ico when a page
// declares no icon; serve the 32px PNG instead of 404ing (default globe).
app.get('/favicon.ico', (req, res) => {
  const iconPath = path.join(__dirname, 'assets', 'favicon-32.png');
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(iconPath);
});

// ── API + AR viewer ───────────────────────────────────────────────────────────
registerProjectsRoutes(app, { requireAuth });
registerMiscRoutes(app, { requireAuth });
registerArRoute(app);

app.listen(PORT, () => {
  console.log(`Kipakosa AR running at http://localhost:${PORT}`);
});

export default app;
