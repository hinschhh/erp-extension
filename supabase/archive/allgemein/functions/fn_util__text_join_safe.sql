CREATE OR REPLACE FUNCTION public.fn_util__text_join_safe(arr text[], sep text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select string_agg(s, sep) from unnest(arr) s where s is not null and btrim(s) <> '';
$function$;
