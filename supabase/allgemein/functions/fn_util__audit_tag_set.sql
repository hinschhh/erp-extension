CREATE OR REPLACE FUNCTION public.fn_util__audit_tag_set(p_uuid uuid)
 RETURNS void
 LANGUAGE sql
AS $function$
 SELECT set_config('app.audit_tag', p_uuid::text, TRUE);
$function$;
