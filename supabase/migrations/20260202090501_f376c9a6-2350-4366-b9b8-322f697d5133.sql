-- Create cloud_scheduled_actions table for syncing reminders
CREATE TABLE IF NOT EXISTS public.cloud_scheduled_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  entity_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  destination JSONB NOT NULL,
  trigger_time BIGINT NOT NULL,
  recurrence TEXT NOT NULL DEFAULT 'once',
  recurrence_anchor JSONB,
  enabled BOOLEAN NOT NULL DEFAULT true,
  original_created_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT unique_user_scheduled_action UNIQUE (user_id, entity_id)
);

-- Enable Row Level Security
ALTER TABLE public.cloud_scheduled_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user access
CREATE POLICY "Users can view their own scheduled actions"
  ON public.cloud_scheduled_actions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own scheduled actions"
  ON public.cloud_scheduled_actions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduled actions"
  ON public.cloud_scheduled_actions
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scheduled actions"
  ON public.cloud_scheduled_actions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for automatic timestamp updates
CREATE TRIGGER update_cloud_scheduled_actions_updated_at
  BEFORE UPDATE ON public.cloud_scheduled_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();