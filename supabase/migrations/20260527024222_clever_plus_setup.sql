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
      crypt('Skip@Pass123', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Rogério"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );

    INSERT INTO public.user_integrations (user_id, status)
    VALUES (new_user_id, 'DISCONNECTED')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can manage their own AI agents" ON public.ai_agents;
CREATE POLICY "Users can manage their own AI agents" ON public.ai_agents
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own contacts" ON public.whatsapp_contacts;
CREATE POLICY "Users can manage their own contacts" ON public.whatsapp_contacts
  FOR ALL USING (auth.uid() = user_id);
