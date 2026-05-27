-- Seed user rogeriomartinsbarros@gmail.com
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'rogeriomartinsbarros@gmail.com') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'rogeriomartinsbarros@gmail.com',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Rogerio"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );
  END IF;
END $$;

-- Create bucket marketing-media if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('marketing-media', 'marketing-media', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/webm'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "Public access to marketing-media" ON storage.objects;
CREATE POLICY "Public access to marketing-media" ON storage.objects FOR SELECT USING (bucket_id = 'marketing-media');

DROP POLICY IF EXISTS "Authenticated users can upload to marketing-media" ON storage.objects;
CREATE POLICY "Authenticated users can upload to marketing-media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'marketing-media');

DROP POLICY IF EXISTS "Users can update own files in marketing-media" ON storage.objects;
CREATE POLICY "Users can update own files in marketing-media" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'marketing-media');

DROP POLICY IF EXISTS "Users can delete own files in marketing-media" ON storage.objects;
CREATE POLICY "Users can delete own files in marketing-media" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'marketing-media');
