# Kipakosa AR

Image-triggered augmented reality for print. Upload a target image + a video;
visitors scan the printed image with their phone and the video plays anchored
to it (8th Wall WebAR). Ships with a public marketing landing page and an
admin app for creating/managing projects.

## Stack

| Layer | Tech |
|---|---|
| Server | Node + Express (`server.js` entry, modules under `server/`) |
| Database | Supabase (Postgres) — projects table + Auth for admin login |
| Media storage | Cloudflare R2 (S3-compatible), served via public CDN URL |
| Target compiler | `sharp` grayscale luminance maps (8th Wall PLANAR targets) |
| AR runtime | 8th Wall XR + A-Frame + xrextras (vendored in `external/`) |
| Front-end | Vanilla HTML/CSS/JS (`landing.html`, `admin.html`, `dashboard.html`, …) |
| Tests | Playwright (`tests/`) |

## Quickstart

```bash
npm install
cp .env.example .env        # if you don't have one yet; fill values below
npm run dev                 # http://localhost:3000
```

Admin login lives at `/admin.html` (Supabase Auth email + password).
Create the admin user in the Supabase dashboard first (see `DEPLOY.md`).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server (`node server.js`) |
| `npm start` | Same, production entrypoint |
| `npm run lint` | ESLint over JS sources |
| `npm test` | Playwright suite (auto-starts the server) |

Full-suite auth tests additionally need `TEST_ADMIN_EMAIL` +
`TEST_ADMIN_PASSWORD`. Opt-in real-compile E2E: `RUN_E2E_REAL=1`.

## HTTP surface

Public (by design):

| Route | Purpose |
|---|---|
| `/`, `/landing` | Marketing landing page |
| `/index.html` | Redirects to `/` |
| `/admin.html` | Admin login (Supabase Auth) |
| `/dashboard.html`, `/projects.html`, `/project.html`, `/create.html` | Admin UI pages (session checked client-side) |
| `/ar?id=<projectId>` | Server-rendered AR viewer — expiry + scan-limit enforced |
| `GET /api/projects`, `GET /api/projects/:id` | Project list/detail (metadata is public-readable) |
| `GET /api/config` | Public config (anon key, CDN URL — nothing secret) |
| `/assets/*`, `/css/*`, `/js/*`, `/external/*` | Static assets (whitelist only — repo root is NOT served) |

Admin (requires `Authorization: Bearer <Supabase access token>`):

| Route | Purpose |
|---|---|
| `POST /api/projects` | Create project (+ optional base64 media fallback; 150 MB limit here only) |
| `PUT /api/projects/:id` | Update metadata / scan limit |
| `DELETE /api/projects/:id` | Delete row **and** purge R2 objects under `<id>/` |
| `GET /api/presign?key=<uuid>/original.jpg\|video.mp4\|luminance.jpg` | Presigned R2 upload URL (key shape whitelisted, rate limited) |

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_SERVICE_KEY` | yes | Secret key — server only, never exposed to browsers |
| `SUPABASE_ANON_KEY` | yes* | Needed for admin login + `/api/config` (*required in practice) |
| `R2_ACCOUNT_ID` | yes | No defaults — fails fast if missing |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | for uploads | Presign + server-side puts |
| `R2_BUCKET` | yes | e.g. `kipakosa-videos` |
| `R2_PUBLIC_URL` | yes | Public CDN base for the bucket |
| `ADMIN_EMAIL` | no | Prefilled on the login form (default `admin@kipakosa.app`) |
| `PORT` | no | Default 3000 |

Test-only: `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`, `RUN_E2E_REAL`.

## Architecture map

```
server.js                  thin entry: pages, static whitelist, router mounting
server/lib/clients.js      env validation, Supabase + R2 clients, prepareTarget()
server/lib/security.js     esc()/jsonForScript(), rateLimit, requireAuth middleware
server/routes/projects.js  CRUD (reads public, writes authed) + R2 purge on delete
server/routes/misc.js      presign + config endpoints
server/routes/ar.js        public /ar viewer (RPC-backed atomic scan counter)
server/views/ar-viewer.js  8th Wall page template (all interpolation escaped)
js/auth.js                 browser Supabase session helpers + authHeaders()
js/db.js                   SWR cache over the projects API
```

Scan counting uses the SQL RPC `increment_scan` when installed (atomic);
otherwise it falls back to the legacy `target_data` read-modify-write.

## Security model & notes

- Reads are intentionally public (shared links/embeds rely on them). Only
  writes require a Supabase Auth token. Treat project names/notes/clients as
  public information.
- All user-derived interpolations into the `/ar` HTML are escaped; JSON is
  embedded script-safe.
- Static serving is whitelisted to `assets/css/js/external` + known pages —
  `.env` and source files are never reachable over HTTP.
- Rate limiting is in-memory (per serverless instance). Add a shared limiter
  (e.g. Upstash) if abuse becomes a concern.
- If you suspect key exposure, rotate using the checklist below.

### Secret rotation checklist

1. **Supabase service key** — Dashboard → Settings → API → roll the secret
   key. Update Vercel env vars + local `.env`, redeploy/restart.
2. **R2 token** — Cloudflare dashboard → R2 → Manage API tokens → roll the
   token credentials. Update `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
   everywhere, redeploy.
3. **Supabase admin password** — Authentication → Users → send reset /
   set new password.
4. Verify after rotation: `npm test`, then log in at `/admin.html` and create
   a throwaway project end-to-end.

## Deployment

See [DEPLOY.md](DEPLOY.md) for Vercel setup, the Supabase schema/RPC SQL and
bucket configuration.
