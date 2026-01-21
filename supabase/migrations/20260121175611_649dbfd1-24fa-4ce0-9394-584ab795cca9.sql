-- Create a table for cloud trash items
CREATE TABLE public.cloud_trash (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  folder TEXT NOT NULL DEFAULT 'Uncategorized',
  deleted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  retention_days INTEGER NOT NULL DEFAULT 30,
  original_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, url)
);

-- Enable Row Level Security
ALTER TABLE public.cloud_trash ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own trash"
ON public.cloud_trash
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own trash"
ON public.cloud_trash
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trash"
ON public.cloud_trash
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trash"
ON public.cloud_trash
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_cloud_trash_updated_at
BEFORE UPDATE ON public.cloud_trash
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();