CREATE OR REPLACE FUNCTION public.fn_util__audit_tag_get()
 RETURNS uuid
 LANGUAGE sql
AS $function$
 SELECT NULLIF(current_setting('app.audit_tag', TRUE), '')::uuid;
$function$;
