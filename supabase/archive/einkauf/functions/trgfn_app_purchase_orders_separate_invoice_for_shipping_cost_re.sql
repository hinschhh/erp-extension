CREATE OR REPLACE FUNCTION public.trgfn_app_purchase_orders_separate_invoice_for_shipping_cost_re()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- Nur reagieren, wenn Flag geändert werden soll
  if tg_op = 'UPDATE'
     and new.separate_invoice_for_shipping_cost is distinct from old.separate_invoice_for_shipping_cost then

     -- Sobald Kosten > 0, darf Flag nicht mehr manuell geändert werden
     if coalesce(old.shipping_cost_net, 0) > 0 then
       raise exception using message =
         'separate_invoice_for_shipping_cost kann nicht geändert werden, nachdem Versandkosten gebucht wurden.';
     end if;
  end if;

  return new;
end;
$function$;
