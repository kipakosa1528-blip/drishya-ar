-- ============================================================================
-- Supabase Schema Migration: Magazines & Multi-Target AR Publications
-- Kipakosa AR Platform
-- ============================================================================

-- 1. Create Magazines Table
CREATE TABLE IF NOT EXISTS public.magazines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    issue_number TEXT DEFAULT '',
    client TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    cover_image_path TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NULL,
    max_scans INTEGER DEFAULT NULL,
    views_count INTEGER DEFAULT 0,
    last_scanned_at TIMESTAMPTZ DEFAULT NULL,
    status TEXT DEFAULT 'draft', -- 'draft', 'published', 'archived'
    
    -- Multi-target definitions: JSONB array containing an entry for every target page.
    -- Schema for each element in targets:
    -- {
    --   "id": "target_1",
    --   "page_number": 1,
    --   "name": "Cover Page",
    --   "image_path": "mag_id/targets/0/original.jpg",
    --   "luminance_path": "mag_id/targets/0/luminance.jpg",
    --   "target_data": { ...8th Wall Planar Target Descriptor... },
    --   "overlay_type": "video" | "image",
    --   "overlay_path": "mag_id/targets/0/overlay.mp4",
    --   "overlay_url": "https://...",
    --   "mux_playback_id": "...",
    --   "mux_asset_id": "...",
    --   "aspect_ratio": 1.414,
    --   "properties": { "autoplay": true, "loop": true, "volume": 1.0 }
    -- }
    targets JSONB DEFAULT '[]'::jsonb
);

-- 2. Indexes for fast query performance
CREATE INDEX IF NOT EXISTS idx_magazines_created_at ON public.magazines (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_magazines_status ON public.magazines (status);
CREATE INDEX IF NOT EXISTS idx_magazines_expires_at ON public.magazines (expires_at);

-- 3. Row Level Security (RLS)
ALTER TABLE public.magazines ENABLE ROW LEVEL SECURITY;

-- Public read access: Anyone with a QR link can load the magazine AR experience
DROP POLICY IF EXISTS "Public can view magazines" ON public.magazines;
CREATE POLICY "Public can view magazines"
    ON public.magazines
    FOR SELECT
    USING (true);

-- Authenticated write access: Only logged in admins/creators can create, update, or delete
DROP POLICY IF EXISTS "Authenticated users can insert magazines" ON public.magazines;
CREATE POLICY "Authenticated users can insert magazines"
    ON public.magazines
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update magazines" ON public.magazines;
CREATE POLICY "Authenticated users can update magazines"
    ON public.magazines
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete magazines" ON public.magazines;
CREATE POLICY "Authenticated users can delete magazines"
    ON public.magazines
    FOR DELETE
    TO authenticated
    USING (true);

-- 4. Atomic Scan Increment Function
CREATE OR REPLACE FUNCTION public.increment_magazine_scan(m_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.magazines
    SET 
        views_count = COALESCE(views_count, 0) + 1,
        last_scanned_at = NOW(),
        updated_at = NOW()
    WHERE id = m_id;
END;
$$;
