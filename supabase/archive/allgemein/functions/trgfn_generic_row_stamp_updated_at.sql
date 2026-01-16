CREATE OR REPLACE FUNCTION public.trgfn_generic_row_stamp_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;
