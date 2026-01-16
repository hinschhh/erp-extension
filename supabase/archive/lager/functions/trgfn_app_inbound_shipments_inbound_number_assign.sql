CREATE OR REPLACE FUNCTION public.trgfn_app_inbound_shipments_inbound_number_assign()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  yr int;
  last_serial int;
  next_serial int;
  prefix text := 'WE'; -- Prefix für Wareneingang (anpassen, z.B. 'IS')
begin
  -- Wenn bereits gesetzt (z. B. Import), nichts tun
  if new.inbound_number is not null and length(new.inbound_number) > 0 then
    return new;
  end if;

  -- Jahr: bevorzugt aus arrived_at, sonst aktuelles Jahr
  yr := coalesce(extract(year from new.arrived_at)::int,
                 extract(year from now())::int);

  -- Lock pro Jahr, um Doppelvergabe bei parallelen Inserts zu verhindern
  perform pg_advisory_xact_lock(hashtext('app_inbound_number_' || yr::text));

  -- Letzte vergebene Seriennummer aus den INBOUND SHIPMENTS lesen
  -- Muster: WE-YYYY-####  (Regex nimmt die Ziffern am Ende)
  select coalesce(
           max(
             (regexp_match(inbound_number, '^' || prefix || '-' || yr::text || '-(\d+)$'))[1]::int
           ),
           0
         )
    into last_serial
    from public.app_inbound_shipments
   where inbound_number like format('%s-%s-%%', prefix, yr);

  next_serial := last_serial + 1;

  -- Format: WE-YYYY-0001
  new.inbound_number := format('%s-%s-%s', prefix, yr, lpad(next_serial::text, 4, '0'));

  return new;
end;
$function$;
