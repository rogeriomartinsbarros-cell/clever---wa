CREATE OR REPLACE FUNCTION public.wipe_whatsapp_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  DELETE FROM public.whatsapp_messages WHERE user_id = p_user_id;
  DELETE FROM public.whatsapp_contacts WHERE user_id = p_user_id;
  DELETE FROM public.contact_identity WHERE user_id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_instance_change()
RETURNS trigger AS $function$
BEGIN
  IF NEW.instance_name IS DISTINCT FROM OLD.instance_name AND OLD.instance_name IS NOT NULL THEN
    PERFORM public.wipe_whatsapp_data(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_instance_change ON public.user_integrations;
CREATE TRIGGER on_instance_change
  AFTER UPDATE OF instance_name ON public.user_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_instance_change();
