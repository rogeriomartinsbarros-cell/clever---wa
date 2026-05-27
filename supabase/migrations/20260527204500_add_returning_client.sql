DO $$
BEGIN
  ALTER TABLE public.whatsapp_contacts ADD COLUMN IF NOT EXISTS is_returning_client BOOLEAN NOT NULL DEFAULT false;
END $$;

INSERT INTO storage.buckets (id, name, public) VALUES ('marketing-media', 'marketing-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "marketing_media_select" ON storage.objects;
CREATE POLICY "marketing_media_select" ON storage.objects FOR SELECT USING (bucket_id = 'marketing-media');

DROP POLICY IF EXISTS "marketing_media_insert" ON storage.objects;
CREATE POLICY "marketing_media_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'marketing-media');

DROP POLICY IF EXISTS "marketing_media_update" ON storage.objects;
CREATE POLICY "marketing_media_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'marketing-media');

DROP POLICY IF EXISTS "marketing_media_delete" ON storage.objects;
CREATE POLICY "marketing_media_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'marketing-media');
