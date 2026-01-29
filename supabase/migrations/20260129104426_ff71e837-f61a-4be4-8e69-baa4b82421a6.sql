-- Add entity_id column to cloud_bookmarks (nullable initially for safe migration)
ALTER TABLE public.cloud_bookmarks 
ADD COLUMN IF NOT EXISTS entity_id uuid;

-- Add entity_id column to cloud_trash (nullable initially for safe migration)
ALTER TABLE public.cloud_trash 
ADD COLUMN IF NOT EXISTS entity_id uuid;

-- Backfill: Set entity_id = id for all existing rows where entity_id is null
-- This preserves existing cloud IDs as entity_ids for legacy data
UPDATE public.cloud_bookmarks 
SET entity_id = id 
WHERE entity_id IS NULL;

UPDATE public.cloud_trash 
SET entity_id = id 
WHERE entity_id IS NULL;

-- Create unique constraint on user_id + entity_id for bookmarks
-- This ensures one entity_id per user (local ID is canonical)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_bookmarks_user_entity 
ON public.cloud_bookmarks(user_id, entity_id);

-- Create unique constraint on user_id + entity_id for trash
CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_trash_user_entity 
ON public.cloud_trash(user_id, entity_id);

-- Make entity_id NOT NULL after backfill
ALTER TABLE public.cloud_bookmarks 
ALTER COLUMN entity_id SET NOT NULL;

ALTER TABLE public.cloud_trash 
ALTER COLUMN entity_id SET NOT NULL;