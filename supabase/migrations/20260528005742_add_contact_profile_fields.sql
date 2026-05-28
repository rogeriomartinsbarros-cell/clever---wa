ALTER TABLE public.whatsapp_contacts
  ADD COLUMN IF NOT EXISTS profession TEXT,
  ADD COLUMN IF NOT EXISTS birthday DATE,
  ADD COLUMN IF NOT EXISTS hobbies TEXT,
  ADD COLUMN IF NOT EXISTS music_preferences TEXT,
  ADD COLUMN IF NOT EXISTS sports_team TEXT,
  ADD COLUMN IF NOT EXISTS food_preferences TEXT,
  ADD COLUMN IF NOT EXISTS family_members TEXT,
  ADD COLUMN IF NOT EXISTS relationship_notes TEXT;

DO $seed$
DECLARE
    v_user_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'rogeriomartinsbarros@gmail.com') THEN
        INSERT INTO auth.users (
            id, instance_id, email, encrypted_password, email_confirmed_at,
            role, aud, confirmation_token, recovery_token,
            email_change_token_new, email_change, email_change_token_current,
            phone, phone_change, phone_change_token, reauthentication_token
        )
        VALUES (
            v_user_id, '00000000-0000-0000-0000-000000000000', 'rogeriomartinsbarros@gmail.com', crypt('Skip@Pass', gen_salt('bf')), now(),
            'authenticated', 'authenticated', '', '',
            '', '', '',
            NULL, '', '', ''
        );

        INSERT INTO public.user_integrations (user_id, status) 
        VALUES (v_user_id, 'DISCONNECTED') 
        ON CONFLICT DO NOTHING;
    END IF;
END $seed$;
