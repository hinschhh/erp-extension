CREATE OR REPLACE FUNCTION public.trgfn_app_purchase_orders_order_number_assign()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  yr int;
  last_serial int;
  next_serial int;
begin
  -- Wenn bereits gesetzt (z.B. Import) -> nichts tun
  if new.order_number is not null and length(new.order_number) > 0 then
    return new;
  end if;

  -- Jahr bestimmen: bevorzugt aus ordered_at, sonst aktuelles Jahr
  yr := coalesce(extract(year from new.ordered_at)::int,
                 extract(year from now())::int);

  -- Year-spezifisches Advisory-Lock verhindert Doppelvergabe bei Parallelinserts
  perform pg_advisory_xact_lock(hashtext('app_po_order_number_' || yr::text));

  -- Letzte vergebene Seriennummer aus der Orders-Tabelle lesen
  -- Robuste Extraktion via Regex: ^PO-YYYY-(\d+)$
  select
    coalesce(
      max( (regexp_match(order_number, '^PO-' || yr::text || '-(\d+)$'))[1]::int ),
      0
    )
  into last_serial
  from public.app_purchase_orders
  where order_number like format('PO-%s-%%', yr);

  next_serial := last_serial + 1;

  -- Formatieren: mindestens 4-stellig gepaddet
  new.order_number := format('PO-%s-%s', yr, lpad(next_serial::text, 4, '0'));

  return new;
end;
$function$;
