CREATE OR REPLACE FUNCTION public.fn_notify_n8n_new_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_url text := 'https://n8n.srv1110395.hstgr.cloud/webhook/afd2d1d0-73da-4afe-a081-e60dda2d57d9';
begin
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'event', 'insert',
      'id', NEW.id,
      'table', TG_TABLE_NAME,
      'data', to_jsonb(NEW)
    )
  );
  return NEW;
end;
$function$;
