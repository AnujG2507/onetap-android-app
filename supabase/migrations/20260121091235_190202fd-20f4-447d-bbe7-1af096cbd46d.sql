-- Create cloud_bookmarks table for syncing bookmarks across devices
CREATE TABLE public.cloud_bookmarks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  folder TEXT NOT NULL DEFAULT 'Uncategorized',
  favicon TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint on user_id + url to prevent duplicates per user
CREATE UNIQUE INDEX idx_cloud_bookmarks_user_url ON public.cloud_bookmarks(user_id, url);

-- Enable Row Level Security
ALTER TABLE public.cloud_bookmarks ENABLE ROW LEVEL SECURITY;

-- Users can only view their own bookmarks
CREATE POLICY "Users can view their own bookmarks"
ON public.cloud_bookmarks
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own bookmarks
CREATE POLICY "Users can create their own bookmarks"
ON public.cloud_bookmarks
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own bookmarks
CREATE POLICY "Users can update their own bookmarks"
ON public.cloud_bookmarks
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own bookmarks
CREATE POLICY "Users can delete their own bookmarks"
ON public.cloud_bookmarks
FOR DELETE
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_cloud_bookmarks_updated_at
BEFORE UPDATE ON public.cloud_bookmarks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();