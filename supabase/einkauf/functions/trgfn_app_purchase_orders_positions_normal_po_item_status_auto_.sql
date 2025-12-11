CREATE OR REPLACE FUNCTION public.trgfn_app_purchase_orders_positions_normal_po_item_status_auto_()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- Nur reagieren, wenn die Position gerade auf 'confirmed' aktualisiert wurde
  if new.po_item_status = 'confirmed' then
    update public.app_purchase_orders_positions_normal
       set po_item_status = 'in_production',
           updated_at = now()
     where id = new.id;
  end if;

  return null; -- AFTER-Trigger: nichts an NEW ändern
end;
$function$;
