CREATE OR REPLACE FUNCTION public.trgfn_app_purchase_orders_positions_special_po_item_status_auto()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  needs_sketch boolean;
begin
  if new.po_item_status = 'confirmed' then
    needs_sketch := new.sketch_needed;

    if coalesce(needs_sketch, false) = false then
      update public.app_purchase_orders_positions_special
         set po_item_status = 'in_production',
             updated_at = now()
       where id = new.id;
    end if;
  end if;

  return null; -- AFTER-Trigger
end;
$function$;
