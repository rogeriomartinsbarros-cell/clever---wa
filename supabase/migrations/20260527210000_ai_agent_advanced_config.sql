ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{"enabled": false, "timezone": "America/Sao_Paulo", "schedule": {"monday": {"start": "09:00", "end": "18:00", "active": true}, "tuesday": {"start": "09:00", "end": "18:00", "active": true}, "wednesday": {"start": "09:00", "end": "18:00", "active": true}, "thursday": {"start": "09:00", "end": "18:00", "active": true}, "friday": {"start": "09:00", "end": "18:00", "active": true}, "saturday": {"start": "09:00", "end": "13:00", "active": false}, "sunday": {"start": "09:00", "end": "13:00", "active": false}}}'::jsonb;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS emergency_contacts TEXT DEFAULT '';
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS knowledge_base TEXT DEFAULT '';

CREATE OR REPLACE FUNCTION public.wipe_whatsapp_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM public.whatsapp_messages WHERE user_id = p_user_id;
  DELETE FROM public.whatsapp_contacts WHERE user_id = p_user_id;
  DELETE FROM public.contact_identity WHERE user_id = p_user_id;
END;
$;
