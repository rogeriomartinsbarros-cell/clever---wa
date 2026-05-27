DO $$
DECLARE
  r RECORD;
  clean_jid TEXT;
BEGIN
  FOR r IN SELECT id, remote_jid FROM public.whatsapp_contacts LOOP
    IF r.remote_jid NOT LIKE '%@%' THEN
      -- Pure number without domain, append suffix
      clean_jid := regexp_replace(r.remote_jid, '\D', '', 'g') || '@s.whatsapp.net';
    ELSIF r.remote_jid LIKE '%@s.whatsapp.net' THEN
      -- Clean prefix to contain only digits
      clean_jid := regexp_replace(split_part(r.remote_jid, '@', 1), '\D', '', 'g') || '@s.whatsapp.net';
    ELSE
      -- Groups or broadcast, leave as is
      clean_jid := r.remote_jid;
    END IF;

    IF clean_jid != r.remote_jid THEN
      BEGIN
        UPDATE public.whatsapp_contacts SET remote_jid = clean_jid WHERE id = r.id;
      EXCEPTION WHEN unique_violation THEN
        -- Do nothing if normalized JID conflicts with another contact
      END;
    END IF;
  END LOOP;
END $$;
