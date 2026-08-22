# Deploying Kipakosa AR (Vercel + Supabase + Cloudflare R2)

## 1. Supabase

### Database schema (SQL editor)

```sql
create table if not exists public.projects (
  id text primary key,
  created_at timestamptz default now(),
  name text not null,
  client text,
  notes text,
  expires_at timestamptz,
  image_path text,
  video_path text,
  target_data jsonb
);

-- Scan analytics columns used by newer code (safe to run on existing tables)
alter table public.projects add column if not exists views_count int default 0;
alter table public.projects add column if not exists max_scans int;
alter table public.projects add column if not exists last_scanned_at timestamptz;

alter table public.projects enable row level security;

-- Reads are public by design; all writes go through the server (service key)
create policy "Allow public read"
  on public.projects for select using (true);
```

### Atomic scan counter RPC

```sql
create or replace function public.increment_scan(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.projects
     set views_count = coalesce(views_count, (target_data->>'_views_count')::int, 0) + 1,
         last_scanned_at = now()
   where id = p_id;
end;
$$;
```

The server calls this RPC on every `/ar` view. If it is missing, the server
falls back to the legacy `target_data._views_count` read-modify-write — install
the RPC to get race-free counting.

### Auth (admin login)

1. Dashboard → Authentication → Providers → enable **Email**.
2. Authentication → Users → **Add user** with the admin email + a strong
   password (match `ADMIN_EMAIL` env var, default `admin@kipakosa.app`).
3. Login page: `/admin.html`. Sessions persist in browser localStorage.

## 2. Cloudflare R2

- Create a bucket (e.g. `kipakosa-videos`) and a public development URL
  (`R2_PUBLIC_URL`, looks like `https://pub-<hash>.r2.dev`).
- Create an API token with Object Read & Write on that bucket →
  `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`.
- `R2_ACCOUNT_ID` is in the Cloudflare account sidebar.

## 3. Vercel

Import the repo; framework preset **Other**. The provided `vercel.json`
deploys `server.js` as one serverless function and bundles static assets.

Environment variables (Settings → Environment Variables):

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_KEY=sb_secret_...
ADMIN_EMAIL=admin@yourdomain.com
R2_ACCOUNT_ID=<cloudflare account id>
R2_ACCESS_KEY_ID=<token id>
R2_SECRET_ACCESS_KEY=<token secret>
R2_BUCKET=kipakosa-videos
R2_PUBLIC_URL=https://pub-<hash>.r2.dev
```

Note: `150 MB` request bodies are accepted only on `POST /api/projects`
(base64 fallback path). Normal uploads use presigned PUTs directly to R2 and
bypass the function body limit.

## 4. Verify after deploy

```bash
curl -s https://<app>.vercel.app/api/config          # returns anon config, no secrets
curl -s -X POST https://<app>.vercel.app/api/projects # expect {"error":"Unauthorized"}
curl -sI https://<app>.vercel.app/.env                # expect 404
```

Then log in at `/admin.html`, create a test project end-to-end, scan its QR
with a phone and confirm the video plays anchored on the image.
