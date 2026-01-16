CREATE OR REPLACE FUNCTION public.trgfn_app_inbound_shipments_status_sync_to_items()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Nur reagieren, wenn sich der Status geändert hat
  if (new.status is distinct from old.status) then
    update public.app_inbound_shipment_items i
       set item_status = new.status
     where i.shipment_id = new.id
       and (i.item_status is distinct from new.status);
  end if;

  -- AFTER-Trigger: Rückgabewert wird ignoriert
  return null;
end;
$function$;
