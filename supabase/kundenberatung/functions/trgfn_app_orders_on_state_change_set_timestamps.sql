CREATE OR REPLACE FUNCTION public.trgfn_app_orders_on_state_change_set_timestamps()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- offered_at bei Status 14 (Angebot)
  if NEW."bb_State" = 14
     and (TG_OP = 'INSERT' or OLD."bb_State" is distinct from NEW."bb_State")
     and NEW.offered_at is null then
    NEW.offered_at := now();
  end if;

  -- ordered_at bei Status 1 (bestellt)
  if NEW."bb_State" = 1
     and (TG_OP = 'INSERT' or OLD."bb_State" is distinct from NEW."bb_State")
     and NEW.ordered_at is null then
    NEW.ordered_at := now();
  end if;

  -- confirmed_at bei Status 2 (bestätigt)
  if NEW."bb_State" = 2
     and (TG_OP = 'INSERT' or OLD."bb_State" is distinct from NEW."bb_State")
     and NEW.confirmed_at is null then
    NEW.confirmed_at := now();
  end if;

  return NEW;
end;
$function$;
