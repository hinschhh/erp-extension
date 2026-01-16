CREATE OR REPLACE FUNCTION public.trgfn_app_inbound_shipment_items_fks_quantity_delivered_restric()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'UPDATE'
     and old.item_status = 'posted'
     and (new.quantity_delivered is distinct from old.quantity_delivered
          or new.po_item_normal_id is distinct from old.po_item_normal_id
          or new.po_item_special_id is distinct from old.po_item_special_id) then
    raise exception 'Mengen-/Positionsänderungen sind nach Posting nicht erlaubt. Bitte Storno/Korrekturprozess verwenden.';
  end if;
  return new;
end;
$function$;
