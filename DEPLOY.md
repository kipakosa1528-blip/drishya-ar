# Supabase + Vercel Deployment

## Environment Variables

### Vercel (set in dashboard → Settings → Environment Variables)
```
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_KEY=sb_secret_...
STORAGE_BUCKET=uploads
```

## Supabase SQL (run in SQL Editor)
```sql
create table public.projects (
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

alter table public.projects enable row level security;

create policy "Allow public read"
  on public.projects for select using (true);
```

## Storage Bucket
- Name: `uploads`
- Public: yes (so AR viewers can load luminance.jpg and video.mp4 directly)
