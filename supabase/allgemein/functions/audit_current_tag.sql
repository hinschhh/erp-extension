CREATE OR REPLACE FUNCTION public.audit_current_tag()
 RETURNS text
 LANGUAGE sql
AS $function$
  select public.fn_util__audit_tag_get();
$function$;
