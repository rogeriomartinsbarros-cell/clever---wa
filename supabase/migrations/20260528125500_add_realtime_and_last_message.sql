-- Add new columns to whatsapp_contacts
ALTER TABLE public.whatsapp_contacts ADD COLUMN IF NOT EXISTS last_message_text TEXT;
ALTER TABLE public.whatsapp_contacts ADD COLUMN IF NOT EXISTS last_message_from_me BOOLEAN DEFAULT FALSE;
ALTER TABLE public.whatsapp_contacts ADD COLUMN IF NOT EXISTS unread_count INTEGER DEFAULT 0;

-- Enable Realtime for the tables to satisfy instant updates
DO $DO$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_contacts;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $DO$;
