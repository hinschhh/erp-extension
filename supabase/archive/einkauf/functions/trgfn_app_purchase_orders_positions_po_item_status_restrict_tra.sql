CREATE OR REPLACE FUNCTION public.trgfn_app_purchase_orders_positions_po_item_status_restrict_tra()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  old_s text := old.po_item_status::text;
  new_s text := new.po_item_status::text;
  allowed boolean := false;
begin
  -- Gleich bleiben immer ok
  if old_s = new_s then
    return new;
  end if;

  -- "anytime" Ziele
  if new_s in ('paused', 'cancelled') then
    -- Hinweis: cancelled ist terminal, d.h. später keine Änderung mehr.
    return new;
  end if;

  -- Wenn bereits cancelled, keinerlei Änderung mehr zulassen
  if old_s = 'cancelled' then
    raise exception 'Statuswechsel von cancelled ist nicht erlaubt';
  end if;

  -- Erlaubte Vorwärts-Übergänge
  -- draft -> ordered
  if old_s = 'draft' and new_s = 'ordered' then allowed := true; end if;
  -- ordered -> confirmed
  if old_s = 'ordered' and new_s = 'confirmed' then allowed := true; end if;
  -- confirmed -> in_production
  if old_s = 'confirmed' and new_s = 'in_production' then allowed := true; end if;
  -- in_production -> partially_delivered | delivered
  if old_s = 'in_production' and new_s in ('partially_delivered', 'delivered') then allowed := true; end if;
  -- partially_delivered -> delivered
  if old_s = 'partially_delivered' and new_s = 'delivered' then allowed := true; end if;

  -- Von paused zurück in die Vorwärtskette:
  if old_s = 'paused' and new_s in ('ordered','confirmed','in_production','partially_delivered','delivered') then
    allowed := true;
  end if;

  -- delivered ist final (außer cancelled/paused die wir oben ausnehmen; hier aber *nicht* freigeben)
  if old_s = 'delivered' then
    raise exception 'Statuswechsel von delivered ist nicht erlaubt';
  end if;

  if not allowed then
    raise exception 'Ungueltiger Statuswechsel: % -> %', old_s, new_s;
  end if;

  return new;
end;
$function$;
