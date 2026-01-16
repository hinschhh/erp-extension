

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE SCHEMA IF NOT EXISTS "internal";


ALTER SCHEMA "internal" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE SCHEMA IF NOT EXISTS "ops";


ALTER SCHEMA "ops" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pgsodium";






CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."is_status" AS ENUM (
    'planned',
    'delivered',
    'posted'
);


ALTER TYPE "public"."is_status" OWNER TO "postgres";


CREATE TYPE "public"."order_channel" AS ENUM (
    'E-Mail',
    'Webseite',
    'Telefon',
    'Sonstiges'
);


ALTER TYPE "public"."order_channel" OWNER TO "postgres";


CREATE TYPE "public"."po_item_kind" AS ENUM (
    'normal',
    'special_order',
    'pod'
);


ALTER TYPE "public"."po_item_kind" OWNER TO "postgres";


CREATE TYPE "public"."po_item_status" AS ENUM (
    'draft',
    'ordered',
    'confirmed',
    'in_production',
    'delivered',
    'paused',
    'cancelled',
    'partially_delivered'
);


ALTER TYPE "public"."po_item_status" OWNER TO "postgres";


CREATE TYPE "public"."po_status" AS ENUM (
    'draft',
    'ordered',
    'confirmed',
    'in_production',
    'partially_in_production',
    'delivered',
    'partially_delivered',
    'cancelled'
);


ALTER TYPE "public"."po_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_current_tag"() RETURNS "text"
    LANGUAGE "sql"
    AS $$
  select public.fn_util__audit_tag_get();
$$;


ALTER FUNCTION "public"."audit_current_tag"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_app_purchase_orders_status_derive_from_items"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$declare
  total int;
  cnt_draft int;
  cnt_ordered int;
  cnt_confirmed int;
  cnt_in_production int;
  cnt_partially_delivered int; -- kann existieren, muss aber nicht genutzt werden
  cnt_delivered int;
  cnt_cancelled int;
  cnt_paused int;

  active_open int; -- = total - cancelled - paused
  new_status public.po_status;
  current_status public.po_status;
begin
  -- Alle Zählwerte holen (normal + special)
  select
    count(*) as total,
    count(*) filter (where po_item_status = 'draft'),
    count(*) filter (where po_item_status = 'ordered'),
    count(*) filter (where po_item_status = 'confirmed'),
    count(*) filter (where po_item_status = 'in_production'),
    count(*) filter (where po_item_status = 'partially_delivered'),
    count(*) filter (where po_item_status = 'delivered'),
    count(*) filter (where po_item_status = 'cancelled'),
    count(*) filter (where po_item_status = 'paused')
  into
    total,
    cnt_draft, cnt_ordered, cnt_confirmed,
    cnt_in_production, cnt_partially_delivered,
    cnt_delivered, cnt_cancelled, cnt_paused
  from (
    select po_item_status
      from public.app_purchase_orders_positions_normal
     where order_id = p_order_id
    union all
    select po_item_status
      from public.app_purchase_orders_positions_special
     where order_id = p_order_id
  ) t;

  -- aktive (offene) Positionen = alles außer cancelled/paused
  active_open := coalesce(total,0) - coalesce(cnt_cancelled,0) - coalesce(cnt_paused,0);

  -- aktuellen Status holen
  select status into current_status
    from public.app_purchase_orders
   where id = p_order_id;

  -- Ableitungslogik (Prioritäten)
  if coalesce(total,0) = 0 then
    new_status := 'draft';

  -- Voll geliefert: alle aktiven sind delivered
  elsif active_open > 0 and coalesce(cnt_delivered,0) >= active_open then
    new_status := 'delivered';

  -- Teilweise geliefert: mind. ein delivered, aber nicht alle aktiven
  elsif coalesce(cnt_delivered,0) > 0 then
    new_status := 'partially_delivered';

  -- Produktion: Mischbestand in_production + andere aktive
  elsif coalesce(cnt_in_production,0) > 0 and coalesce(cnt_in_production,0) < active_open then
    new_status := 'partially_in_production';

  elsif active_open > 0 and coalesce(cnt_in_production,0) = active_open then
    new_status := 'in_production';

  elsif active_open > 0 and coalesce(cnt_confirmed,0) = active_open then
    new_status := 'confirmed';

  elsif active_open > 0 and coalesce(cnt_ordered,0) = active_open then
    new_status := 'ordered';

  elsif active_open > 0 and coalesce(cnt_draft,0) = active_open then
    new_status := 'draft';

  else
    -- Fallback: wenn nur cancelled/paused übrig sind, als „delivered“ werten
    -- (oder, wenn du das anders möchtest, hier auf 'cancelled' setzen)
    new_status := current_status;
  end if;

  -- Nur updaten, wenn sich etwas ändert
  if new_status is distinct from current_status then
    update public.app_purchase_orders
       set status = new_status,
           updated_at = now(),
           -- confirmed-Datum nur beim erstmaligen Erreichen setzen
          confirmed_at = case
             when new_status = 'confirmed' and confirmed_at is null then now()
             else confirmed_at
           end
     where id = p_order_id;
  end if;
end;$$;


ALTER FUNCTION "public"."fn_app_purchase_orders_status_derive_from_items"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_app_purchase_orders_status_derive_from_items_old"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  total int;
  active int;
  cnt_draft int;
  cnt_ordered int;
  cnt_confirmed int;
  cnt_in_production int;
  cnt_partially_delivered int;
  cnt_delivered int;
  cnt_cancelled int;
  cnt_paused int;
  new_status public.po_status;
begin
  select
    count(*) filter (where po_item_status not in ('cancelled','paused')),
    count(*) as total,
    count(*) filter (where po_item_status = 'draft'),
    count(*) filter (where po_item_status = 'ordered'),
    count(*) filter (where po_item_status = 'confirmed'),
    count(*) filter (where po_item_status = 'in_production'),
    count(*) filter (where po_item_status = 'partially_delivered'),
    count(*) filter (where po_item_status = 'delivered'),
    count(*) filter (where po_item_status = 'cancelled'),
    count(*) filter (where po_item_status = 'paused')
  into
    active, total,
    cnt_draft, cnt_ordered, cnt_confirmed,
    cnt_in_production, cnt_partially_delivered,
    cnt_delivered, cnt_cancelled, cnt_paused
  from (
    select po_item_status from public.app_purchase_orders_positions_normal where order_id = p_order_id
    union all
    select po_item_status from public.app_purchase_orders_positions_special where order_id = p_order_id
  ) t;

  if total = 0 then
    new_status := 'draft';
  elsif active = 0 and cnt_cancelled > 0 then
    new_status := 'cancelled';
  elsif cnt_delivered > 0 and (cnt_delivered + cnt_cancelled + cnt_paused = total) then
    new_status := 'delivered';
  elsif cnt_partially_delivered > 0 then
    new_status := 'partially_delivered';
  elsif cnt_in_production > 0 and (cnt_in_production < active) then
    new_status := 'partially_in_production';
  elsif cnt_in_production = active then
    new_status := 'in_production';
  elsif cnt_confirmed = active then
    new_status := 'confirmed';
  elsif cnt_ordered = active then
    new_status := 'ordered';
  elsif cnt_draft = active then
    new_status := 'draft';
  else
    new_status := 'ordered';
  end if;

  update public.app_purchase_orders
     set status = new_status,
         updated_at = now(),
         -- nur beim erstmaligen Erreichen von 'confirmed' setzen
         proforma_confirmed_at = case
           when new_status = 'confirmed' and proforma_confirmed_at is null then now()
           else proforma_confirmed_at
         end
   where id = p_order_id;
end;
$$;


ALTER FUNCTION "public"."fn_app_purchase_orders_status_derive_from_items_old"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_is_post_and_dispatch"("p_inbound_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$declare
  v_inbound         app_inbound_shipments%rowtype;
  v_supplier_name   text;
  v_order_numbers   text;
  v_items_count     int;
  v_outbox_id       bigint;
  v_payload_items   jsonb;
  v_payload         jsonb;
begin
  -- Inbound laden & plausibilisieren
  select * into v_inbound
  from app_inbound_shipments
  where id = p_inbound_id;

  if not found then
    raise exception 'Inbound shipment % not found', p_inbound_id using errcode = 'P0002';
  end if;

  if v_inbound.status = 'posted' then
    raise exception 'Inbound shipment % already posted', p_inbound_id;
  end if;

  -- Supplier-Name (optional)
  select s.id into v_supplier_name
  from app_suppliers s
  where s.id = v_inbound.fk_bb_supplier;

  -- Alle zugehörigen Bestellnummern zusammenführen (distinct, sortiert)
  select string_agg(distinct o.order_number, ', ' order by o.order_number)
    into v_order_numbers
  from app_inbound_shipment_items isi
  join app_purchase_orders o on o.id = isi.order_id
  where isi.shipment_id = p_inbound_id;

  -- *** WICHTIG: Nur normale Positionen aggregieren (special wird ausgeschlossen) ***
  with items_raw as (
    select
      pn.billbee_product_id::text as id,
      sum(isi.quantity_delivered)::numeric as amount
    from app_inbound_shipment_items isi
    join app_purchase_orders_positions_normal pn on pn.id = isi.po_item_normal_id
    where isi.shipment_id = p_inbound_id
      and pn.billbee_product_id is not null
    group by pn.billbee_product_id
  ),
  items as (
    select
      jsonb_agg(
        jsonb_build_object(
          'id', id,                          -- BillbeeId als String; Edge-Function nutzt lookupBy="id"
          'lookupBy', 'id',
          'amount', amount,
          'reason',
            format(
              'INBOUND %s | %s | %s | INV %s',
              coalesce(v_inbound.inbound_number, '?'),
              coalesce(v_order_numbers, '?'),
              coalesce(v_supplier_name, '?'),
              coalesce(v_inbound.delivery_note_no, '?')
            )
        )
      ) as items_json,
      count(*) as cnt
    from items_raw
  )
  select items_json, cnt into v_payload_items, v_items_count
  from items;

  if v_items_count is null then
    v_items_count := 0;
  end if;

  -- Nur wenn es normale Items gibt, Outbox schreiben
  if v_items_count > 0 then
    v_payload := jsonb_build_object(
      'items', coalesce(v_payload_items, '[]'::jsonb),
      'forceSendStockToShops', true,
      'autosubtractReservedAmount', false
    );

    insert into integration_outbox (topic, payload)
    values ('billbee.stock.increase', v_payload)
    returning id into v_outbox_id;
  else
    v_outbox_id := null;
    v_payload := null;
  end if;

  -- Inbound auf posted setzen (immer)
  update app_inbound_shipments
     set status = 'posted',
         updated_at = now()
   where id = p_inbound_id;

  return jsonb_build_object(
    'ok', true,
    'inbound_id', p_inbound_id,
    'outbox_id', v_outbox_id,
    'items_count', v_items_count,
    'payload', v_payload
  );
end;$$;


ALTER FUNCTION "public"."fn_is_post_and_dispatch"("p_inbound_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_notify_n8n_new_entry"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$declare
  v_url text := 'https://n8n.srv1110395.hstgr.cloud/webhook/afd2d1d0-73da-4afe-a081-e60dda2d57d9';
begin
perform net.http_post(
  url := 'https://n8n.srv1110395.hstgr.cloud/webhook/afd2d1d0-73da-4afe-a081-e60dda2d57d9',
  
  headers := jsonb_build_object('Content-Type', 'application/json'),
  body := jsonb_build_object(
    'event', 'insert',
    'id', NEW.id,
    'table', TG_TABLE_NAME,
    'data', to_jsonb(NEW)
  )
);
  return NEW;
end;$$;


ALTER FUNCTION "public"."fn_notify_n8n_new_entry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_util__audit_tag_get"() RETURNS "uuid"
    LANGUAGE "sql"
    AS $$ SELECT NULLIF(current_setting('app.audit_tag', TRUE), '')::uuid; $$;


ALTER FUNCTION "public"."fn_util__audit_tag_get"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_util__audit_tag_set"("p_uuid" "uuid") RETURNS "void"
    LANGUAGE "sql"
    AS $$ SELECT set_config('app.audit_tag', p_uuid::text, TRUE); $$;


ALTER FUNCTION "public"."fn_util__audit_tag_set"("p_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_util__text_join_safe"("arr" "text"[], "sep" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select string_agg(s, sep) from unnest(arr) s where s is not null and btrim(s) <> '';
$$;


ALTER FUNCTION "public"."fn_util__text_join_safe"("arr" "text"[], "sep" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_inventory_sessions" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "note" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "counting_started_at" timestamp with time zone,
    "snapshot_taken_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "fk_stocks" bigint,
    CONSTRAINT "inventory_sessions_status_check" CHECK (("status" = ANY (ARRAY['counting'::"text", 'review'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."app_inventory_sessions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_app_inventory_session_start"("p_name" "text", "p_note" "text" DEFAULT NULL::"text") RETURNS "public"."app_inventory_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_session public.app_inventory_sessions;
  v_existing_id bigint;
begin
  -- ensure caller is authenticated
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- prüfen, ob bereits eine aktive Inventur läuft
  select id
  into v_existing_id
  from public.app_inventory_sessions
  where status in ('counting', 'review')
  limit 1;

  if v_existing_id is not null then
    raise exception
      'Es läuft bereits eine Inventur (Session-ID=%). Bitte diese erst abschließen, bevor eine neue gestartet wird.',
      v_existing_id
      using errcode = 'check_violation';
  end if;

  -- create session and mark counting with snapshot timestamp
  insert into public.app_inventory_sessions
    (name, note, status, counting_started_at, snapshot_taken_at, created_at)
  values
    (p_name, p_note, 'counting', now(), now(), now())
  returning * into v_session;

  -- snapshot current stock levels (one row per app_stock_levels entry)
  insert into public.app_inventory_snapshots (
    session_id,
    fk_products,
    fk_stocks,
    source_stock_level_id,
    bb_stock_current,
    bb_unfullfilled_amount,
    qty_unsellable,
    stock_location,
    snapshot_taken_at,
    created_at
  )
  select
    v_session.id,
    sl.fk_products,
    sl.fk_stocks,
    sl.id,
    coalesce(sl."bb_StockCurrent", 0),
    sl."bb_UnfullfilledAmount",
    sl.qty_unsellable,
    sl."bb_StockCode",
    v_session.snapshot_taken_at,
    v_session.snapshot_taken_at
  from public.app_stock_levels sl;

  return v_session;
end;
$$;


ALTER FUNCTION "public"."rpc_app_inventory_session_start"("p_name" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_app_purchase_orders_positions_po_item_status_set_for_order"("p_order_id" "uuid", "p_status" "text", "p_dol_planned_at" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_prev_status text;
  v_updated_normal  int := 0;
  v_updated_special int := 0;
BEGIN
  SELECT status::text
    INTO v_prev_status
    FROM public.app_purchase_orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0002';
  END IF;

  IF v_prev_status = 'draft' AND p_status NOT IN ('ordered') THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', v_prev_status, p_status;
  ELSIF v_prev_status = 'ordered' AND p_status NOT IN ('confirmed') THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', v_prev_status, p_status;
  END IF;

  UPDATE public.app_purchase_orders_positions_normal
     SET po_item_status = p_status::po_item_status,
         updated_at     = now()
   WHERE order_id = p_order_id
     AND po_item_status IS DISTINCT FROM p_status::po_item_status;
  GET DIAGNOSTICS v_updated_normal = ROW_COUNT;

  UPDATE public.app_purchase_orders_positions_special
     SET po_item_status = p_status::po_item_status,
         updated_at     = now()
   WHERE order_id = p_order_id
     AND po_item_status IS DISTINCT FROM p_status::po_item_status;
  GET DIAGNOSTICS v_updated_special = ROW_COUNT;

  IF p_status = 'ordered' THEN
    UPDATE public.app_purchase_orders
       SET ordered_at = current_date,
           updated_at = now()
     WHERE id = p_order_id;

  ELSIF p_status = 'confirmed' THEN
    UPDATE public.app_purchase_orders
       SET proforma_confirmed_at = current_date,
           dol_planned_at        = coalesce(p_dol_planned_at, dol_planned_at),
           updated_at            = now()
     WHERE id = p_order_id;
  END IF;

  -- ✅ NEUER Name:
  PERFORM public.fn_app_purchase_orders_status_derive_from_items(p_order_id);

  RETURN jsonb_build_object(
    'updated_normal',  v_updated_normal,
    'updated_special', v_updated_special,
    'new_status',      p_status
  );
END;
$$;


ALTER FUNCTION "public"."rpc_app_purchase_orders_positions_po_item_status_set_for_order"("p_order_id" "uuid", "p_status" "text", "p_dol_planned_at" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_app_purchase_orders_positions_special_sketch_confirm_and_ad"("p_item_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  update public.app_purchase_orders_positions_special
     set sketch_confirmed_at = now(),
         po_item_status = 'in_production',
         updated_at = now()
   where id = p_item_id
     and sketch_confirmed_at is null;
$$;


ALTER FUNCTION "public"."rpc_app_purchase_orders_positions_special_sketch_confirm_and_ad"("p_item_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_app_inbound_shipment_items_fks_quantity_delivered_restric"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."trgfn_app_inbound_shipment_items_fks_quantity_delivered_restric"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_app_inbound_shipment_items_po_item_status_sync_from_poste"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_normal_id   uuid;
  v_special_id  uuid;

  v_qty_ordered     numeric;
  v_sum_posted      numeric;
  v_count_posted    integer;
begin
  -- Betroffene IDs je nach Operation ermitteln
  if tg_op = 'INSERT' then
    v_normal_id  := new.po_item_normal_id;
    v_special_id := new.po_item_special_id;
  elsif tg_op = 'UPDATE' then
    v_normal_id  := coalesce(new.po_item_normal_id, old.po_item_normal_id);
    v_special_id := coalesce(new.po_item_special_id, old.po_item_special_id);
  else -- DELETE
    v_normal_id  := old.po_item_normal_id;
    v_special_id := old.po_item_special_id;
  end if;

  -- === NORMAL-Position ===
  if v_normal_id is not null then
    select p.qty_ordered into v_qty_ordered
    from public.app_purchase_orders_positions_normal p
    where p.id = v_normal_id;

    if found then
      -- Nur POSTED-Items zählen!
      select coalesce(sum(isi.quantity_delivered), 0)::numeric,
             count(*)::int
        into v_sum_posted, v_count_posted
      from public.app_inbound_shipment_items isi
      where isi.po_item_normal_id = v_normal_id
        and isi.item_status = 'posted';

      -- Wenn (noch) nichts gepostet ist -> KEIN Positionsstatus-Update
      if v_count_posted > 0 then
        if v_sum_posted >= v_qty_ordered then
          update public.app_purchase_orders_positions_normal p
             set po_item_status    = 'delivered',
                 goods_received_at = case when p.goods_received_at is null then now() else p.goods_received_at end,
                 updated_at        = now()
           where p.id = v_normal_id;
        else
          update public.app_purchase_orders_positions_normal p
             set po_item_status = 'partially_delivered',
                 updated_at     = now()
           where p.id = v_normal_id;
        end if;
      end if;
    end if;
  end if;

  -- === SPECIAL-Position ===
  if v_special_id is not null then
    select p.qty_ordered into v_qty_ordered
    from public.app_purchase_orders_positions_special p
    where p.id = v_special_id;

    if found then
      -- Nur POSTED-Items zählen!
      select coalesce(sum(isi.quantity_delivered), 0)::numeric,
             count(*)::int
        into v_sum_posted, v_count_posted
      from public.app_inbound_shipment_items isi
      where isi.po_item_special_id = v_special_id
        and isi.item_status = 'posted';

      if v_count_posted > 0 then
        if v_sum_posted >= v_qty_ordered then
          update public.app_purchase_orders_positions_special p
             set po_item_status    = 'delivered',
                 goods_received_at = case when p.goods_received_at is null then now() else p.goods_received_at end,
                 updated_at        = now()
           where p.id = v_special_id;
        else
          update public.app_purchase_orders_positions_special p
             set po_item_status = 'partially_delivered',
                 updated_at     = now()
           where p.id = v_special_id;
        end if;
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;


ALTER FUNCTION "public"."trgfn_app_inbound_shipment_items_po_item_status_sync_from_poste"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_app_inbound_shipments_inbound_number_assign"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $_$declare
  yr int;
  last_serial int;
  next_serial int;
  prefix text := 'WE'; -- Prefix für Wareneingang (anpassen, z.B. 'IS')
begin
  -- Wenn bereits gesetzt (z. B. Import), nichts tun
  if new.inbound_number is not null and length(new.inbound_number) > 0 then
    return new;
  end if;

  -- Jahr: bevorzugt aus delivered_at, sonst aktuelles Jahr
  yr := coalesce(extract(year from new.delivered_at)::int,
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
end;$_$;


ALTER FUNCTION "public"."trgfn_app_inbound_shipments_inbound_number_assign"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_delta numeric;
  v_shipment_total numeric;
  v_shipping_amount numeric;
begin
  if tg_op = 'INSERT' then
    v_delta := coalesce(new.shipping_cost_separate, 0);
    v_shipping_amount := coalesce(new.shipping_cost_separate, 0);
  elsif tg_op = 'UPDATE' then
    v_delta := coalesce(new.shipping_cost_separate, 0) - coalesce(old.shipping_cost_separate, 0);
    v_shipping_amount := coalesce(new.shipping_cost_separate, 0);
  else
    return coalesce(new, old);
  end if;

  if v_delta = 0 then
    return new;
  end if;

  -- ====================================================================================
  -- PART 1: Keep existing PO-level allocation (for backwards compatibility)
  -- ====================================================================================
  with order_qty as (
    select
      i.order_id,
      sum(i.quantity_delivered)::numeric as qty_total
    from public.app_inbound_shipment_items i
    where i.shipment_id = new.id
    group by i.order_id
  ),
  totals as (
    select sum(qty_total)::numeric as grand_total
    from order_qty
  ),
  alloc as (
    select
      q.order_id,
      round((q.qty_total / nullif(t.grand_total, 0)) * v_delta, 2) as add_amount
    from order_qty q
    cross join totals t
    where coalesce(t.grand_total, 0) > 0
  )
  update public.app_purchase_orders p
     set shipping_cost_net = coalesce(p.shipping_cost_net, 0) + a.add_amount,
         separate_invoice_for_shipping_cost = true,
         updated_at = now()
    from alloc a
   where p.id = a.order_id;

  -- ====================================================================================
  -- PART 2: NEW - Allocate to shipment items (not positions)
  -- ====================================================================================
  
  -- Calculate total value of items in this shipment
  select sum(
    isi.quantity_delivered * 
    coalesce(
      popn.unit_price_net,
      pops.unit_price_net,
      0
    )
  ) into v_shipment_total
  from public.app_inbound_shipment_items isi
  left join public.app_purchase_orders_positions_normal popn on isi.po_item_normal_id = popn.id
  left join public.app_purchase_orders_positions_special pops on isi.po_item_special_id = pops.id
  where isi.shipment_id = new.id;

  -- Allocate proportionally to each shipment item
  if coalesce(v_shipment_total, 0) > 0 and v_shipping_amount > 0 then
    
    -- Update shipment items with their proportional share
    update public.app_inbound_shipment_items isi
    set shipping_costs_proportional = round(
      (isi.quantity_delivered * 
       coalesce(
         (select unit_price_net from app_purchase_orders_positions_normal where id = isi.po_item_normal_id),
         (select unit_price_net from app_purchase_orders_positions_special where id = isi.po_item_special_id),
         0
       ) / v_shipment_total
      ) * v_shipping_amount,
      2
    )
    where isi.shipment_id = new.id
      and coalesce(
        (select unit_price_net from app_purchase_orders_positions_normal where id = isi.po_item_normal_id),
        (select unit_price_net from app_purchase_orders_positions_special where id = isi.po_item_special_id),
        0
      ) > 0;
      
  elsif v_shipping_amount = 0 then
    -- If shipping is set to 0, zero out the allocations for items in this shipment
    update public.app_inbound_shipment_items
    set shipping_costs_proportional = 0
    where shipment_id = new.id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_app_inbound_shipments_status_sync_to_items"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."trgfn_app_inbound_shipments_status_sync_to_items"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trgfn_app_inbound_shipments_status_sync_to_items"() IS 'Spiegelt Änderungen von app_inbound_shipments.status auf app_inbound_shipment_items.item_status (alle Items des Shipments).';



CREATE OR REPLACE FUNCTION "public"."trgfn_app_orders_on_state_change_set_timestamps"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."trgfn_app_orders_on_state_change_set_timestamps"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_app_products_inventory_category_assign_from_bb_categories"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$declare
    v_cat text;
begin
    -- Nur setzen, wenn kein manueller Wert angegeben ist
    if new.inventory_cagtegory is null then
        if coalesce(new.bb_category1, '') in ('WT', 'Küche', 'Rohling', 'Schrank', 'SB', 'Spiegel', 'TV', 'Wohnmöbel')
           or coalesce(new.bb_category2, '') in ('WT', 'Küche', 'Rohling', 'Schrank', 'SB', 'Spiegel', 'TV', 'Wohnmöbel')
           or coalesce(new.bb_category3, '') in ('WT', 'Küche', 'Rohling', 'Schrank', 'SB', 'Spiegel', 'TV', 'Wohnmöbel') then
            v_cat := 'Möbel';

        elsif coalesce(new.bb_category1, '') in ('Armatur', 'Elektrogeräte', 'TV-Zubehör', 'Zubehör')
           or coalesce(new.bb_category2, '') in ('Armatur', 'Elektrogeräte', 'TV-Zubehör', 'Zubehör')
           or coalesce(new.bb_category3, '') in ('Armatur', 'Elektrogeräte', 'TV-Zubehör', 'Zubehör') then
            v_cat := 'Handelswaren';

        elsif coalesce(new.bb_category1, '') in ('WB')
           or coalesce(new.bb_category2, '') in ('WB')
           or coalesce(new.bb_category3, '') in ('WB') then
            v_cat := 'Bauteile';

        elsif coalesce(new.bb_category1, '') in ('Naturstein')
           or coalesce(new.bb_category2, '') in ('Naturstein')
           or coalesce(new.bb_category3, '') in ('Naturstein') then
            v_cat := 'Naturstein';
        else
            v_cat := null;
        end if;

        new.inventory_cagtegory := v_cat;
    end if;

    return new;
end;$$;


ALTER FUNCTION "public"."trgfn_app_products_inventory_category_assign_from_bb_categories"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_app_purchase_orders_order_number_assign"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $_$
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
$_$;


ALTER FUNCTION "public"."trgfn_app_purchase_orders_order_number_assign"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_app_purchase_orders_positions_normal_po_item_status_auto_"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."trgfn_app_purchase_orders_positions_normal_po_item_status_auto_"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_app_purchase_orders_positions_normal_view_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE app_purchase_orders_positions_normal
  SET
    order_id = NEW.order_id,
    billbee_product_id = NEW.billbee_product_id,
    qty_ordered = NEW.qty_ordered,
    unit_price_net = NEW.unit_price_net,
    po_item_status = NEW.po_item_status,
    internal_notes = NEW.internal_notes,
    proforma_confirmed_at = NEW.proforma_confirmed_at,
    dol_planned_at = NEW.dol_planned_at,
    dol_actual_at = NEW.dol_actual_at,
    goods_received_at = NEW.goods_received_at,
    fk_app_orders_id = NEW.fk_app_orders_id,
    updated_at = NOW()
  WHERE id = OLD.id;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trgfn_app_purchase_orders_positions_normal_view_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_app_purchase_orders_positions_po_item_status_restrict_tra"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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

  -- delivered ist final (außer cancelled/paused – die wir oben ausnehmen; hier aber *nicht* freigeben)
  if old_s = 'delivered' then
    raise exception 'Statuswechsel von delivered ist nicht erlaubt';
  end if;

  if not allowed then
    raise exception 'Ungueltiger Statuswechsel: % -> %', old_s, new_s;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trgfn_app_purchase_orders_positions_po_item_status_restrict_tra"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_app_purchase_orders_positions_special_po_item_status_auto"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  needs_sketch boolean;
begin
  if new.po_item_status = 'confirmed' then
    -- Flag der Position prüfen (Feldname anpassen, falls abweichend)
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
$$;


ALTER FUNCTION "public"."trgfn_app_purchase_orders_positions_special_po_item_status_auto"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_app_purchase_orders_positions_special_view_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$BEGIN
  UPDATE app_purchase_orders_positions_special
  SET
    order_id = NEW.order_id,
    billbee_product_id = NEW.billbee_product_id,
    base_model_billbee_product_id = NEW.base_model_billbee_product_id,
    supplier_sku = NEW.supplier_sku,
    details_override = NEW.details_override,
    qty_ordered = NEW.qty_ordered,
    unit_price_net = NEW.unit_price_net,
    po_item_status = NEW.po_item_status,
    internal_notes = NEW.internal_notes,
    sketch_needed = NEW.sketch_needed,
    sketch_confirmed_at = NEW.sketch_confirmed_at,
    confirmed_at = NEW.proforma_confirmed_at,
    dol_planned_at = NEW.dol_planned_at,
    dol_actual_at = NEW.dol_actual_at,
    goods_received_at = NEW.goods_received_at,
    order_confirmation_ref = NEW.order_confirmation_ref,
    fk_app_orders_id = NEW.fk_app_orders_id,
    fk_app_order_items_id = NEW.fk_app_order_items_id,
    updated_at = NOW()
  WHERE id = OLD.id;
  
  RETURN NEW;
END;$$;


ALTER FUNCTION "public"."trgfn_app_purchase_orders_positions_special_view_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_app_purchase_orders_positions_status_trigger_recalc_po_st"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM public.fn_app_purchase_orders_status_derive_from_items(
    COALESCE(NEW.order_id, OLD.order_id)
  );
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."trgfn_app_purchase_orders_positions_status_trigger_recalc_po_st"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_app_purchase_orders_separate_invoice_for_shipping_cost_re"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."trgfn_app_purchase_orders_separate_invoice_for_shipping_cost_re"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_app_purchase_orders_status_recalc_shipping_on_partially_i"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    -- Nur reagieren, wenn Status sich geändert hat und jetzt 'partially_in_production' ist
    if new.status = 'partially_in_production'
       and (old.status is distinct from new.status) then

        perform public.fn_po_recalc_shipping_allocation(new.id);
    end if;

    return new;
end;
$$;


ALTER FUNCTION "public"."trgfn_app_purchase_orders_status_recalc_shipping_on_partially_i"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_generic_audit_logs_row_insert_update_delete_log"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_batch uuid := public.audit_current_tag();
  v_user  uuid := auth.uid();
  v_entity_id text;
BEGIN
  IF v_user IS NULL THEN
    v_user := '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;

  v_entity_id := COALESCE((CASE WHEN TG_OP <> 'DELETE' THEN NEW.id::text END),
                          (CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text END));

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(user_id, action, entity_name, entity_id, old_values, new_values, created_at, batch_id)
    VALUES (v_user, 'INSERT', TG_TABLE_NAME, v_entity_id, NULL, to_jsonb(NEW), now(), v_batch);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs(user_id, action, entity_name, entity_id, old_values, new_values, created_at, batch_id)
    VALUES (v_user, 'UPDATE', TG_TABLE_NAME, v_entity_id, to_jsonb(OLD), to_jsonb(NEW), now(), v_batch);
    RETURN NEW;

  ELSE
    INSERT INTO public.audit_logs(user_id, action, entity_name, entity_id, old_values, new_values, created_at, batch_id)
    VALUES (v_user, 'DELETE', TG_TABLE_NAME, v_entity_id, to_jsonb(OLD), NULL, now(), v_batch);
    RETURN OLD;
  END IF;
END;
$$;


ALTER FUNCTION "public"."trgfn_generic_audit_logs_row_insert_update_delete_log"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_generic_row_stamp_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end $$;


ALTER FUNCTION "public"."trgfn_generic_row_stamp_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_propagate_po_shipping_to_shipment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_po_shipping numeric;
  v_shipment_shipping numeric;
BEGIN
  -- Get PO shipping cost
  SELECT shipping_cost_net 
  INTO v_po_shipping
  FROM app_purchase_orders
  WHERE id = NEW.order_id;
  
  -- Get current shipment shipping cost
  SELECT shipping_cost_separate
  INTO v_shipment_shipping
  FROM app_inbound_shipments
  WHERE id = NEW.shipment_id;
  
  -- If PO has shipping AND shipment doesn't have shipping yet, copy it
  IF COALESCE(v_po_shipping, 0) > 0 AND COALESCE(v_shipment_shipping, 0) = 0 THEN
    UPDATE app_inbound_shipments
    SET shipping_cost_separate = v_po_shipping
    WHERE id = NEW.shipment_id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trgfn_propagate_po_shipping_to_shipment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trgfn_update_product_price_on_posting"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_product_id bigint;
  v_unit_price_net numeric;
  v_landed_cost_per_unit numeric;
BEGIN
  -- Only proceed if status changed to 'posted'
  IF NEW.item_status = 'posted' AND (OLD.item_status IS NULL OR OLD.item_status IS DISTINCT FROM 'posted') THEN
    
    -- ONLY update for NORMAL positions (standard products)
    -- SPECIAL positions are custom orders and should not update product master
    IF NEW.po_item_normal_id IS NOT NULL THEN
      SELECT 
        billbee_product_id,
        unit_price_net
      INTO v_product_id, v_unit_price_net
      FROM app_purchase_orders_positions_normal
      WHERE id = NEW.po_item_normal_id;
      
      -- Calculate landed cost per unit (unit price + proportional shipping per unit)
      IF v_product_id IS NOT NULL AND NEW.quantity_delivered > 0 THEN
        v_landed_cost_per_unit := v_unit_price_net + 
          (COALESCE(NEW.shipping_costs_proportional, 0) / NEW.quantity_delivered);
        
        -- Update product's net purchase price
        UPDATE app_products
        SET bb_net_purchase_price = v_landed_cost_per_unit
        WHERE id = v_product_id;
        
        RAISE NOTICE 'Updated product % purchase price to % (unit: % + shipping/unit: %)',
          v_product_id,
          v_landed_cost_per_unit,
          v_unit_price_net,
          (COALESCE(NEW.shipping_costs_proportional, 0) / NEW.quantity_delivered);
      END IF;
    END IF;
    -- NOTE: We explicitly do NOT update for po_item_special_id
    -- Special positions are custom orders with individual pricing
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trgfn_update_product_price_on_posting"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vwfn_app_purchase_orders_positions_normal_view_row_route_write"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$begin
  -- INSERT
  if tg_op = 'INSERT' then
    insert into public.app_purchase_orders_positions_normal (
      id,
      order_id,
      billbee_product_id,
      qty_ordered,
      unit_price_net,
      po_item_status,
      shipping_costs_proportional,
      internal_notes,
      confirmed_at,
      dol_planned_at,
      dol_actual_at,
      fk_app_orders_id,
      fk_app_order_items_id,
      goods_received_at,
      created_at,
      updated_at
    ) values (
      coalesce(new.id, gen_random_uuid()),
      new.order_id,
      new.billbee_product_id,
      new.qty_ordered,
      new.unit_price_net,
      new.po_item_status,
      new.shipping_costs_proportional,
      new.internal_notes,
      new.proforma_confirmed_at,
      new.dol_planned_at,
      new.dol_actual_at,
      new.fk_app_orders_id,
      new.fk_app_order_items_id,
      new.goods_received_at,
      coalesce(new.created_at, now()),
      now()
    )
    returning * into new;
    return new;
  end if;

  -- UPDATE
  if tg_op = 'UPDATE' then
    update public.app_purchase_orders_positions_normal
       set order_id = new.order_id,
           billbee_product_id = new.billbee_product_id,
           qty_ordered = new.qty_ordered,
           unit_price_net = new.unit_price_net,
           po_item_status = new.po_item_status,
           shipping_costs_proportional = new.shipping_costs_proportional,
           internal_notes = new.internal_notes,
           confirmed_at = new.proforma_confirmed_at,
           dol_planned_at = new.dol_planned_at,
           dol_actual_at = new.dol_actual_at,
           fk_app_orders_id = new.fk_app_orders_id,
            fk_app_order_items_id = new.fk_app_order_items_id,
           goods_received_at = new.goods_received_at,
           updated_at = now()
     where id = old.id;
    return new;
  end if;

  -- DELETE
  if tg_op = 'DELETE' then
    delete from public.app_purchase_orders_positions_normal
     where id = old.id;
    return old;
  end if;

  return null;
end;$$;


ALTER FUNCTION "public"."vwfn_app_purchase_orders_positions_normal_view_row_route_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vwfn_app_purchase_orders_positions_special_view_row_route_write"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$begin
  -- INSERT via View -> Basistabelle
  if tg_op = 'INSERT' then
    insert into public.app_purchase_orders_positions_special (
      id,
      order_id,
      billbee_product_id,
      qty_ordered,
      unit_price_net,
      supplier_sku,
      details_override,
      po_item_status,
      shipping_costs_proportional,
      internal_notes,
      sketch_needed,
      sketch_confirmed_at,
      confirmed_at,
      dol_planned_at,
      dol_actual_at,
      fk_app_orders_id,
      fk_app_order_items_id,
      goods_received_at,
      created_at,
      updated_at,
      external_file_url
    )
    values (
      coalesce(new.id, gen_random_uuid()),
      new.order_id,
      new.billbee_product_id,
      new.qty_ordered,
      new.unit_price_net,
      new.supplier_sku,
      new.details_override,
      new.po_item_status,
      new.shipping_costs_proportional,
      new.internal_notes,
      new.sketch_needed,
      new.sketch_confirmed_at,
      new.confirmed_at,
      new.dol_planned_at,
      new.dol_actual_at,
      new.external_file_url,
      new.fk_app_orders_id,
      new.fk_app_order_items_id,
      new.goods_received_at,
      coalesce(new.created_at, now()),
      now()
    )
    returning * into new;

    return new;
  end if;

  -- UPDATE via View -> Basistabelle
  if tg_op = 'UPDATE' then
    update public.app_purchase_orders_positions_special
       set order_id                   = new.order_id,
           billbee_product_id         = new.billbee_product_id,
           supplier_sku               = new.supplier_sku,
           details_override           = new.details_override,
           qty_ordered                = new.qty_ordered,
           unit_price_net             = new.unit_price_net,
           po_item_status             = new.po_item_status,
           shipping_costs_proportional= new.shipping_costs_proportional,
           internal_notes             = new.internal_notes,
           sketch_needed              = new.sketch_needed,
           sketch_confirmed_at        = new.sketch_confirmed_at,
           confirmed_at               = new.confirmed_at,
           dol_planned_at             = new.dol_planned_at,
           dol_actual_at              = new.dol_actual_at,
           fk_app_orders_id           = new.fk_app_orders_id,
           fk_app_order_items_id      = new.fk_app_order_items_id,
           goods_received_at          = new.goods_received_at,
           external_file_url          = new.external_file_url,
           updated_at                 = now()
     where id = old.id;

    return new;
  end if;

  -- DELETE via View -> Basistabelle
  if tg_op = 'DELETE' then
    delete from public.app_purchase_orders_positions_special
     where id = old.id;

    return old;
  end if;

  return null;
end;$$;


ALTER FUNCTION "public"."vwfn_app_purchase_orders_positions_special_view_row_route_write"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "internal"."cron_secrets" (
    "name" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "internal"."cron_secrets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "internal"."cron_settings" (
    "name" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "internal"."cron_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "internal"."sync_audit" (
    "id" bigint NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "ok" boolean,
    "error" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "internal"."sync_audit" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "internal"."sync_audit_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "internal"."sync_audit_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "internal"."sync_audit_id_seq" OWNED BY "internal"."sync_audit"."id";



CREATE TABLE IF NOT EXISTS "internal"."sync_state" (
    "id" "text" NOT NULL,
    "phase" "text" DEFAULT 'stock'::"text" NOT NULL,
    "components_cursor" "text",
    "bom_cursor" "text",
    "batches_run" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "internal"."sync_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ops"."sync_runs" (
    "id" bigint NOT NULL,
    "kind" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "total_candidates" integer DEFAULT 0,
    "processed_ok" integer DEFAULT 0,
    "processed_err" integer DEFAULT 0
);


ALTER TABLE "ops"."sync_runs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "ops"."sync_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "ops"."sync_runs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "ops"."sync_runs_id_seq" OWNED BY "ops"."sync_runs"."id";



CREATE TABLE IF NOT EXISTS "ops"."sync_tasks_reservedamount" (
    "id" bigint NOT NULL,
    "run_id" bigint NOT NULL,
    "billbee_product_id" bigint NOT NULL,
    "sku" "text",
    "priority" integer DEFAULT 100 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "ops"."sync_tasks_reservedamount" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "ops"."sync_tasks_reservedamount_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "ops"."sync_tasks_reservedamount_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "ops"."sync_tasks_reservedamount_id_seq" OWNED BY "ops"."sync_tasks_reservedamount"."id";



CREATE TABLE IF NOT EXISTS "public"."app_complaints" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fk_app_orders_id" bigint,
    "description" "text",
    "stage" "text",
    "improvement_idea" "text",
    "fk_app_order_items_id" bigint
);


ALTER TABLE "public"."app_complaints" OWNER TO "postgres";


ALTER TABLE "public"."app_complaints" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_complaints_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_complaints_stages" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id" "text" NOT NULL
);


ALTER TABLE "public"."app_complaints_stages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_order_items" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fk_app_orders_id" bigint,
    "fk_app_products_id" bigint,
    "bb_TransactionId" "text",
    "bb_Quantity" smallint,
    "bb_TotalPrice" numeric,
    "bb_TaxAmount" numeric,
    "bb_TaxIndex" smallint,
    "bb_Dicount" numeric,
    "bb_GetPriceFromArticleIfAny" boolean,
    "bb_IsCoupon" boolean,
    "bb_ShippingProfileId" smallint,
    "bb_DontAdjustStock" boolean,
    "bb_UnrebatedTotalPrice" numeric,
    "bb_SerialNumber" "text",
    "bb_InvoiceSKU" "text",
    "bb_StockId" bigint,
    "is_active" boolean DEFAULT true,
    "deactivated_at" timestamp with time zone
);


ALTER TABLE "public"."app_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_orders" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bb_OrderNumber" "text",
    "bb_State" smallint,
    "bb_VatMode" smallint,
    "bb_CreatedAt" "text",
    "offered_at" timestamp with time zone,
    "bb_ConfirmedAt" "text",
    "bb_ShippedAt" "text",
    "bb_PayedAt" "text",
    "bb_SellerComment" "text",
    "bb_InvoiceNumberPrefix" "text",
    "bb_InvoiceNumber" "text",
    "bb_InvoiceDate" "text",
    "bb_Currency" "text",
    "bb_LastModifiedAt" "text",
    "bb_WebUrl" "text",
    "fk_app_customers_id" bigint,
    "bb_import_ab-nummer" "text",
    "bb_Platform" "text",
    "bb_BillbeeShopName" "text",
    "ordered_at" timestamp with time zone,
    "confirmed_at" timestamp with time zone,
    "bb_TotalCost" numeric,
    "bb_ShippingCost" numeric,
    "bb_AdjustmentCost" numeric,
    "bb_PaidAmount" numeric
);


ALTER TABLE "public"."app_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bom_recipes" (
    "id" bigint NOT NULL,
    "billbee_bom_id" bigint NOT NULL,
    "billbee_component_id" bigint NOT NULL,
    "quantity" numeric NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bom_recipes_quantity_check" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."bom_recipes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."app_component_sales_last_3_months" AS
 WITH "order_items_3m" AS (
         SELECT "oi"."id",
            "oi"."fk_app_orders_id",
            "oi"."fk_app_products_id",
            "oi"."bb_Quantity",
            "o"."created_at"
           FROM ("public"."app_order_items" "oi"
             JOIN "public"."app_orders" "o" ON (("o"."id" = "oi"."fk_app_orders_id")))
          WHERE (("o"."ordered_at" >= ("now"() - '3 mons'::interval)) AND (COALESCE("oi"."bb_IsCoupon", false) = false))
        ), "direct_component_sales" AS (
         SELECT "oi"."fk_app_products_id" AS "component_id",
            "sum"(COALESCE(("oi"."bb_Quantity")::integer, 0)) AS "qty_component_sold"
           FROM ("order_items_3m" "oi"
             LEFT JOIN "public"."bom_recipes" "br" ON (("br"."billbee_bom_id" = "oi"."fk_app_products_id")))
          WHERE (("br"."billbee_bom_id" IS NULL) AND ("oi"."fk_app_products_id" IS NOT NULL))
          GROUP BY "oi"."fk_app_products_id"
        ), "bom_component_sales" AS (
         SELECT "br"."billbee_component_id" AS "component_id",
            "sum"(((COALESCE(("oi"."bb_Quantity")::integer, 0))::numeric * "br"."quantity")) AS "qty_component_sold"
           FROM ("order_items_3m" "oi"
             JOIN "public"."bom_recipes" "br" ON (("br"."billbee_bom_id" = "oi"."fk_app_products_id")))
          GROUP BY "br"."billbee_component_id"
        ), "all_component_sales" AS (
         SELECT "direct_component_sales"."component_id",
            "direct_component_sales"."qty_component_sold"
           FROM "direct_component_sales"
        UNION ALL
         SELECT "bom_component_sales"."component_id",
            "bom_component_sales"."qty_component_sold"
           FROM "bom_component_sales"
        )
 SELECT "cs"."component_id" AS "fk_app_products_id",
    "sum"("cs"."qty_component_sold") AS "qty_sold_last_3_months"
   FROM "all_component_sales" "cs"
  GROUP BY "cs"."component_id";


ALTER TABLE "public"."app_component_sales_last_3_months" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_customers" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bb_Name" "text",
    "bb_Email" "text",
    "bb_Tel1" "text",
    "bb_Tel2" "text",
    "bb_Number" bigint,
    "bb_PriceGroupId" bigint,
    "bb_VatId" "text",
    "bb_Type" smallint,
    "bb_ShippingAddress_CountryISO2" "text",
    "bb_InvoiceAddress_CountryISO2" "text",
    "bb_InvoiceAddress_Zip" "text",
    "bb_ShippingAddress_Zip" "text"
);


ALTER TABLE "public"."app_customers" OWNER TO "postgres";


ALTER TABLE "public"."app_customers" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_customers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_inbound_shipment_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shipment_id" "uuid" NOT NULL,
    "po_item_normal_id" "uuid",
    "po_item_special_id" "uuid",
    "order_id" "uuid" NOT NULL,
    "quantity_delivered" numeric(12,3) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "item_status" "public"."is_status",
    "shipping_costs_proportional" numeric DEFAULT 0,
    CONSTRAINT "app_inbound_shipment_items_quantity_delivered_check" CHECK (("quantity_delivered" > (0)::numeric)),
    CONSTRAINT "chk_exactly_one_kind" CHECK ((((("po_item_normal_id" IS NOT NULL))::integer + (("po_item_special_id" IS NOT NULL))::integer) = 1))
);


ALTER TABLE "public"."app_inbound_shipment_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."app_inbound_shipment_items"."shipping_costs_proportional" IS 'Proportional share of shipping costs (ANK/Anschaffungsnebenkosten) allocated to this specific shipment item. 
Calculated from app_inbound_shipments.shipping_cost_separate based on item value proportion.
This is the ONLY source of truth for ANK allocation. Position tables no longer have this field.';



CREATE TABLE IF NOT EXISTS "public"."app_inbound_shipments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_note_number" "text",
    "delivered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "shipping_cost_separate" numeric,
    "fk_bb_supplier" "text",
    "inbound_number" "text",
    "status" "public"."is_status",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "invoice_number" "text",
    "invoice_date" timestamp with time zone,
    "invoice_file_url" "text",
    "delivery_note_file_url" "text",
    "shipping_cost_invoice_number" "text",
    "shipping_cost_invoice_file_url" "text"
);


ALTER TABLE "public"."app_inbound_shipments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_inventory_adjustments" (
    "id" bigint NOT NULL,
    "session_id" bigint NOT NULL,
    "fk_products" bigint NOT NULL,
    "fk_stocks" bigint NOT NULL,
    "delta" numeric NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_message" "text",
    "source_count_id" bigint,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_adjustments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text", 'applied'::"text"])))
);


ALTER TABLE "public"."app_inventory_adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_inventory_counts" (
    "id" bigint NOT NULL,
    "session_id" bigint NOT NULL,
    "fk_products" bigint NOT NULL,
    "fk_stocks" bigint NOT NULL,
    "stock_location" bigint,
    "qty_sellable" numeric DEFAULT 0 NOT NULL,
    "qty_unsellable" numeric DEFAULT 0 NOT NULL,
    "counted_by" "uuid",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_inventory_counts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_inventory_snapshots" (
    "id" bigint NOT NULL,
    "session_id" bigint NOT NULL,
    "fk_products" bigint NOT NULL,
    "fk_stocks" bigint NOT NULL,
    "source_stock_level_id" bigint,
    "bb_stock_current" numeric NOT NULL,
    "bb_unfullfilled_amount" numeric,
    "snapshot_taken_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "qty_unsellable" bigint,
    "stock_location" "text"
);


ALTER TABLE "public"."app_inventory_snapshots" OWNER TO "postgres";


ALTER TABLE "public"."app_orders" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_order_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_order_item_attributes" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bb_Name" "text",
    "bb_Value" "text",
    "fk_app_order_items_id" bigint
);


ALTER TABLE "public"."app_order_item_attributes" OWNER TO "postgres";


ALTER TABLE "public"."app_order_item_attributes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_order_item_attributes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_products" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bb_sku" "text",
    "id" bigint NOT NULL,
    "bb_is_bom" boolean,
    "bb_is_active" boolean,
    "bb_category1" "text",
    "bb_category2" "text",
    "bb_category3" "text",
    "bb_net_purchase_price" numeric,
    "supplier_sku" "text",
    "purchase_details" "text",
    "fk_bb_supplier" "text",
    "bb_name" "text",
    "inventory_cagtegory" "text",
    "production_required" "text" GENERATED ALWAYS AS (
CASE
    WHEN ((COALESCE("bb_category1", ''::"text") ~~* '%On Demand - Externe Bestellung/Produktion erforderlich%'::"text") OR (COALESCE("bb_category2", ''::"text") ~~* '%On Demand - Externe Bestellung/Produktion erforderlich%'::"text") OR (COALESCE("bb_category3", ''::"text") ~~* '%On Demand - Externe Bestellung/Produktion erforderlich%'::"text")) THEN 'On Demand - Externe Bestellung/Produktion erforderlich'::"text"
    WHEN ((COALESCE("bb_category1", ''::"text") ~~* '%Produktion erforderlich%'::"text") OR (COALESCE("bb_category2", ''::"text") ~~* '%Produktion erforderlich%'::"text") OR (COALESCE("bb_category3", ''::"text") ~~* '%Produktion erforderlich%'::"text")) THEN 'Produktion erforderlich'::"text"
    WHEN ((COALESCE("bb_category1", ''::"text") ~~* '%Produktion nicht erforderlich%'::"text") OR (COALESCE("bb_category2", ''::"text") ~~* '%Produktion nicht erforderlich%'::"text") OR (COALESCE("bb_category3", ''::"text") ~~* '%Produktion nicht erforderlich%'::"text")) THEN 'Produktion nicht erforderlich'::"text"
    ELSE '-'::"text"
END) STORED,
    "bb_Price" numeric,
    "bb_Net" numeric,
    "is_variant_set" boolean GENERATED ALWAYS AS ((("bb_category1" = 'Varianten-Set'::"text") OR ("bb_category2" = 'Varianten-Set'::"text") OR ("bb_category3" = 'Varianten-Set'::"text"))) STORED,
    "is_antique" boolean GENERATED ALWAYS AS ((("bb_category1" = 'Antike Ware'::"text") OR ("bb_category2" = 'Antike Ware'::"text") OR ("bb_category3" = 'Antike Ware'::"text"))) STORED,
    "room" "text" GENERATED ALWAYS AS (
CASE
    WHEN (("bb_category1" = ANY (ARRAY['Armatur'::"text", 'Badezimmer-Set'::"text", 'Schrank'::"text", 'Spiegel'::"text", 'WB'::"text", 'WT'::"text", 'Zubehör'::"text"])) OR ("bb_category2" = ANY (ARRAY['Armatur'::"text", 'Badezimmer-Set'::"text", 'Schrank'::"text", 'Spiegel'::"text", 'WB'::"text", 'WT'::"text", 'Zubehör'::"text"])) OR ("bb_category3" = ANY (ARRAY['Armatur'::"text", 'Badezimmer-Set'::"text", 'Schrank'::"text", 'Spiegel'::"text", 'WB'::"text", 'WT'::"text", 'Zubehör'::"text"]))) THEN 'Bad'::"text"
    WHEN (("bb_category1" = ANY (ARRAY['Küche'::"text", 'Elektrogeräte'::"text"])) OR ("bb_category2" = ANY (ARRAY['Küche'::"text", 'Elektrogeräte'::"text"])) OR ("bb_category3" = ANY (ARRAY['Küche'::"text", 'Elektrogeräte'::"text"]))) THEN 'Küche'::"text"
    WHEN (("bb_category1" = ANY (ARRAY['TV'::"text", 'TV-Zubehör'::"text"])) OR ("bb_category2" = ANY (ARRAY['TV'::"text", 'TV-Zubehör'::"text"])) OR ("bb_category3" = ANY (ARRAY['TV'::"text", 'TV-Zubehör'::"text"]))) THEN 'TV'::"text"
    WHEN (("bb_category1" = 'Wohnmöbel'::"text") OR ("bb_category2" = 'Wohnmöbel'::"text") OR ("bb_category3" = 'Wohnmöbel'::"text")) THEN 'Wohnmöbel'::"text"
    WHEN (("bb_category1" = ANY (ARRAY['Naturstein'::"text", 'Platte'::"text", 'Rohling'::"text", 'SB'::"text"])) OR ("bb_category2" = ANY (ARRAY['Naturstein'::"text", 'Platte'::"text", 'Rohling'::"text", 'SB'::"text"])) OR ("bb_category3" = ANY (ARRAY['Naturstein'::"text", 'Platte'::"text", 'Rohling'::"text", 'SB'::"text"]))) THEN 'Komponente'::"text"
    WHEN (("bb_category1" = 'Service'::"text") OR ("bb_category2" = 'Service'::"text") OR ("bb_category3" = 'Service'::"text")) THEN 'Service'::"text"
    ELSE NULL::"text"
END) STORED,
    "product_type" "text" GENERATED ALWAYS AS (
CASE
    WHEN ("bb_category1" = ANY (ARRAY['Armatur'::"text", 'Badezimmer-Set'::"text", 'Elektrogeräte'::"text", 'Küche'::"text", 'Schrank'::"text", 'Spiegel'::"text", 'TV'::"text", 'TV-Zubehör'::"text", 'WB'::"text", 'Wohnmöbel'::"text", 'WT'::"text", 'Zubehör'::"text", 'Naturstein'::"text"])) THEN "bb_category1"
    WHEN ("bb_category2" = ANY (ARRAY['Armatur'::"text", 'Badezimmer-Set'::"text", 'Elektrogeräte'::"text", 'Küche'::"text", 'Schrank'::"text", 'Spiegel'::"text", 'TV'::"text", 'TV-Zubehör'::"text", 'WB'::"text", 'Wohnmöbel'::"text", 'WT'::"text", 'Zubehör'::"text", 'Naturstein'::"text"])) THEN "bb_category2"
    WHEN ("bb_category3" = ANY (ARRAY['Armatur'::"text", 'Badezimmer-Set'::"text", 'Elektrogeräte'::"text", 'Küche'::"text", 'Schrank'::"text", 'Spiegel'::"text", 'TV'::"text", 'TV-Zubehör'::"text", 'WB'::"text", 'Wohnmöbel'::"text", 'WT'::"text", 'Zubehör'::"text", 'Naturstein'::"text"])) THEN "bb_category3"
    ELSE NULL::"text"
END) STORED
);


ALTER TABLE "public"."app_products" OWNER TO "postgres";


COMMENT ON COLUMN "public"."app_products"."bb_net_purchase_price" IS 'Standard purchase price per unit including proportional shipping costs (landed cost). 
Automatically updated when NORMAL (not special) inbound shipment items are posted. 
Represents typical acquisition cost including ANK for regular stock purchases.';



CREATE OR REPLACE VIEW "public"."app_order_items_active_with_attributes_and_products_view" AS
 SELECT "oi"."id",
    "oi"."fk_app_orders_id",
    "oi"."fk_app_products_id",
    "oi"."bb_Quantity" AS "qty_ordered",
    "oi"."created_at",
    "p"."bb_sku",
    "p"."bb_name",
    COALESCE("jsonb_agg"("jsonb_build_object"('bb_Name', "oia"."bb_Name", 'bb_Value', "oia"."bb_Value") ORDER BY "oia"."bb_Name") FILTER (WHERE ("oia"."bb_Name" IS NOT NULL)), '[]'::"jsonb") AS "attributes"
   FROM ((("public"."app_order_items" "oi"
     JOIN "public"."app_orders" "o" ON (("oi"."fk_app_orders_id" = "o"."id")))
     LEFT JOIN "public"."app_products" "p" ON (("oi"."fk_app_products_id" = "p"."id")))
     LEFT JOIN "public"."app_order_item_attributes" "oia" ON (("oi"."id" = "oia"."fk_app_order_items_id")))
  WHERE ("o"."bb_State" = ANY (ARRAY[1, 2, 3, 16]))
  GROUP BY "oi"."id", "oi"."fk_app_orders_id", "oi"."fk_app_products_id", "oi"."bb_Quantity", "oi"."created_at", "p"."bb_sku", "p"."bb_name";


ALTER TABLE "public"."app_order_items_active_with_attributes_and_products_view" OWNER TO "postgres";


ALTER TABLE "public"."app_order_items" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_order_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."view_order_items_active_with_attributes_and_products_view" AS
 WITH "base" AS (
         SELECT "oi"."id",
            "oi"."fk_app_orders_id",
            "oi"."fk_app_products_id",
            "oi"."bb_Quantity" AS "qty_ordered",
            "oi"."created_at",
            "p"."bb_sku",
            "p"."bb_name",
            "o"."bb_State",
            COALESCE("jsonb_agg"("jsonb_build_object"('bb_Name', "oia"."bb_Name", 'bb_Value', "oia"."bb_Value") ORDER BY "oia"."bb_Name") FILTER (WHERE ("oia"."bb_Name" IS NOT NULL)), '[]'::"jsonb") AS "attributes_raw"
           FROM ((("public"."app_order_items" "oi"
             JOIN "public"."app_orders" "o" ON (("oi"."fk_app_orders_id" = "o"."id")))
             LEFT JOIN "public"."app_products" "p" ON (("oi"."fk_app_products_id" = "p"."id")))
             LEFT JOIN "public"."app_order_item_attributes" "oia" ON (("oi"."id" = "oia"."fk_app_order_items_id")))
          GROUP BY "oi"."id", "oi"."fk_app_orders_id", "oi"."fk_app_products_id", "oi"."bb_Quantity", "oi"."created_at", "p"."bb_sku", "p"."bb_name", "o"."bb_State"
        )
 SELECT "base"."id",
    "base"."fk_app_orders_id",
    "base"."fk_app_products_id",
    "base"."qty_ordered",
    "base"."created_at",
    "base"."bb_sku",
    "base"."bb_name",
    "base"."attributes_raw" AS "attributes",
    (("base"."bb_name" ~~* '%sonder%'::"text") OR ("base"."bb_sku" ~~* '%sonder%'::"text") OR (("base"."attributes_raw")::"text" ~~* '%sonder%'::"text")) AS "is_sonder_item"
   FROM "base"
  WHERE ("base"."bb_State" = ANY (ARRAY[1, 2, 3, 4, 16]));


ALTER TABLE "public"."view_order_items_active_with_attributes_and_products_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."app_orders_with_customers_view" AS
 SELECT "o"."id",
    "o"."created_at",
    "o"."bb_OrderNumber",
    "o"."bb_CreatedAt",
    "o"."bb_State",
    "o"."bb_VatMode",
    "o"."bb_InvoiceNumber",
    "o"."bb_InvoiceDate",
    "o"."fk_app_customers_id",
    "c"."bb_Name" AS "customer_name",
    ((COALESCE("o"."bb_import_ab-nummer", ''::"text") || ' '::"text") || COALESCE("c"."bb_Name", ''::"text")) AS "search_blob",
    "o"."bb_import_ab-nummer",
    COALESCE(( SELECT "count"(*) AS "count"
           FROM "public"."view_order_items_active_with_attributes_and_products_view" "voi"
          WHERE (("voi"."fk_app_orders_id" = "o"."id") AND ("voi"."is_sonder_item" = true))), (0)::bigint) AS "sonder_item_count"
   FROM ("public"."app_orders" "o"
     LEFT JOIN "public"."app_customers" "c" ON (("c"."id" = "o"."fk_app_customers_id")));


ALTER TABLE "public"."app_orders_with_customers_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_products_inventory_categories" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "inventory_category" "text" NOT NULL
);


ALTER TABLE "public"."app_products_inventory_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" "text" NOT NULL,
    "status" "public"."po_status" DEFAULT 'draft'::"public"."po_status" NOT NULL,
    "ordered_at" "date",
    "confirmed_at" "date",
    "dol_planned_at" "date",
    "dol_actual_at" "date",
    "invoice_number" "text",
    "invoice_date" "date",
    "shipping_cost_net" numeric(12,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "separate_invoice_for_shipping_cost" boolean DEFAULT false NOT NULL,
    "supplier" "text",
    "invoice_file_url" "text",
    "confirmation_number" "text",
    "confirmation_file_url" "text"
);


ALTER TABLE "public"."app_purchase_orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."app_purchase_orders"."shipping_cost_net" IS 'Shipping cost included in supplier order confirmation (when supplier organizes shipping). 
This will be automatically copied to app_inbound_shipments.shipping_cost_separate when goods arrive, 
then allocated to items for ANK calculation. Use app_inbound_shipments.shipping_cost_separate for 
shipping organized by logistics partner.';



CREATE TABLE IF NOT EXISTS "public"."app_purchase_orders_positions_normal" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "billbee_product_id" bigint NOT NULL,
    "qty_ordered" numeric(12,3) DEFAULT 1 NOT NULL,
    "unit_price_net" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "internal_notes" "text",
    "confirmed_at" "date",
    "dol_planned_at" "date",
    "dol_actual_at" "date",
    "goods_received_at" "date",
    "po_item_status" "public"."po_item_status" DEFAULT 'draft'::"public"."po_item_status",
    "fk_app_orders_id" bigint,
    "fk_app_order_items_id" bigint
);


ALTER TABLE "public"."app_purchase_orders_positions_normal" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."app_purchase_orders_positions_normal_view" AS
 WITH "received" AS (
         SELECT "isi"."po_item_normal_id" AS "po_item_id",
            "sum"("isi"."quantity_delivered") AS "qty_received"
           FROM "public"."app_inbound_shipment_items" "isi"
          WHERE ("isi"."po_item_normal_id" IS NOT NULL)
          GROUP BY "isi"."po_item_normal_id"
        )
 SELECT "p"."id",
    "p"."order_id",
    "p"."billbee_product_id",
    "p"."qty_ordered",
    "p"."unit_price_net",
    (COALESCE("r"."qty_received", (0)::numeric))::numeric(12,3) AS "qty_received",
    (GREATEST(("p"."qty_ordered" - COALESCE("r"."qty_received", (0)::numeric)), (0)::numeric))::numeric(12,3) AS "qty_open",
    "p"."po_item_status",
    "p"."internal_notes",
    "p"."confirmed_at" AS "proforma_confirmed_at",
    "p"."dol_planned_at",
    "p"."dol_actual_at",
    "p"."goods_received_at",
    "p"."created_at",
    "p"."updated_at",
    "p"."fk_app_orders_id",
    "o"."bb_OrderNumber" AS "bb_order_number",
    "c"."bb_Name" AS "customer_name",
    "p"."fk_app_order_items_id"
   FROM ((("public"."app_purchase_orders_positions_normal" "p"
     LEFT JOIN "received" "r" ON (("r"."po_item_id" = "p"."id")))
     LEFT JOIN "public"."app_orders" "o" ON (("o"."id" = "p"."fk_app_orders_id")))
     LEFT JOIN "public"."app_customers" "c" ON (("c"."id" = "o"."fk_app_customers_id")));


ALTER TABLE "public"."app_purchase_orders_positions_normal_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_purchase_orders_positions_special" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "billbee_product_id" bigint NOT NULL,
    "base_model_billbee_product_id" bigint,
    "supplier_sku" "text",
    "details_override" "text",
    "order_confirmation_ref" "text",
    "external_file_url" "text",
    "qty_ordered" numeric(12,3) DEFAULT 1 NOT NULL,
    "unit_price_net" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "internal_notes" "text",
    "confirmed_at" "date",
    "sketch_confirmed_at" "date",
    "dol_planned_at" "date",
    "dol_actual_at" "date",
    "goods_received_at" "date",
    "po_item_status" "public"."po_item_status" DEFAULT 'draft'::"public"."po_item_status",
    "sketch_needed" boolean DEFAULT true,
    "fk_app_order_items_id" bigint,
    "fk_app_orders_id" bigint
);


ALTER TABLE "public"."app_purchase_orders_positions_special" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."app_purchase_orders_positions_special_view" AS
 WITH "received" AS (
         SELECT "isi"."po_item_special_id" AS "po_item_id",
            "sum"("isi"."quantity_delivered") AS "qty_received"
           FROM "public"."app_inbound_shipment_items" "isi"
          WHERE ("isi"."po_item_special_id" IS NOT NULL)
          GROUP BY "isi"."po_item_special_id"
        )
 SELECT "p"."id",
    "p"."order_id",
    "p"."billbee_product_id",
    "p"."base_model_billbee_product_id",
    "p"."supplier_sku",
    "p"."details_override",
    "p"."qty_ordered",
    "p"."unit_price_net",
    (COALESCE("r"."qty_received", (0)::numeric))::numeric(12,3) AS "qty_received",
    (GREATEST(("p"."qty_ordered" - COALESCE("r"."qty_received", (0)::numeric)), (0)::numeric))::numeric(12,3) AS "qty_open",
    "p"."po_item_status",
    "p"."internal_notes",
    "p"."sketch_needed",
    "p"."sketch_confirmed_at",
    "p"."confirmed_at" AS "proforma_confirmed_at",
    "p"."dol_planned_at",
    "p"."dol_actual_at",
    "p"."goods_received_at",
    "p"."order_confirmation_ref",
    "p"."created_at",
    "p"."updated_at",
    "p"."fk_app_orders_id",
    "o"."bb_OrderNumber" AS "bb_order_number",
    "c"."bb_Name" AS "customer_name",
    "p"."fk_app_order_items_id",
    "p"."external_file_url"
   FROM ((("public"."app_purchase_orders_positions_special" "p"
     LEFT JOIN "received" "r" ON (("r"."po_item_id" = "p"."id")))
     LEFT JOIN "public"."app_orders" "o" ON (("o"."id" = "p"."fk_app_orders_id")))
     LEFT JOIN "public"."app_customers" "c" ON (("c"."id" = "o"."fk_app_customers_id")));


ALTER TABLE "public"."app_purchase_orders_positions_special_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."app_purchase_orders_view" AS
 WITH "received" AS (
         SELECT COALESCE("isi"."po_item_normal_id", "isi"."po_item_special_id") AS "po_item_id",
            "sum"("isi"."quantity_delivered") AS "qty_received"
           FROM "public"."app_inbound_shipment_items" "isi"
          GROUP BY COALESCE("isi"."po_item_normal_id", "isi"."po_item_special_id")
        ), "normal" AS (
         SELECT "p"."order_id",
            "sum"("p"."qty_ordered") AS "qty_ordered_total",
            "sum"(COALESCE("r"."qty_received", (0)::numeric)) AS "qty_received_total",
            "sum"(GREATEST(("p"."qty_ordered" - COALESCE("r"."qty_received", (0)::numeric)), (0)::numeric)) AS "qty_open_total",
            "count"(*) AS "count_positions_normal",
            COALESCE("sum"(("p"."unit_price_net" * "p"."qty_ordered")), (0)::numeric) AS "amount_net_normal"
           FROM ("public"."app_purchase_orders_positions_normal" "p"
             LEFT JOIN "received" "r" ON (("r"."po_item_id" = "p"."id")))
          GROUP BY "p"."order_id"
        ), "special" AS (
         SELECT "p"."order_id",
            "sum"("p"."qty_ordered") AS "qty_ordered_total",
            "sum"(COALESCE("r"."qty_received", (0)::numeric)) AS "qty_received_total",
            "sum"(GREATEST(("p"."qty_ordered" - COALESCE("r"."qty_received", (0)::numeric)), (0)::numeric)) AS "qty_open_total",
            "count"(*) AS "count_positions_special",
            "count"(*) FILTER (WHERE (("p"."sketch_needed" = true) AND ("p"."sketch_confirmed_at" IS NULL))) AS "count_sketch_pending",
            COALESCE("sum"(("p"."unit_price_net" * "p"."qty_ordered")), (0)::numeric) AS "amount_net_special"
           FROM ("public"."app_purchase_orders_positions_special" "p"
             LEFT JOIN "received" "r" ON (("r"."po_item_id" = "p"."id")))
          GROUP BY "p"."order_id"
        ), "search" AS (
         SELECT "po"."id" AS "order_id",
            "lower"(TRIM(BOTH FROM "concat_ws"(' '::"text", COALESCE("po"."order_number", ''::"text"), COALESCE("po"."invoice_number", ''::"text"), COALESCE("po"."supplier", ''::"text"), COALESCE("po"."notes", ''::"text"), COALESCE("string_agg"(DISTINCT "pn"."internal_notes", ' '::"text") FILTER (WHERE (("pn"."internal_notes" IS NOT NULL) AND ("pn"."internal_notes" <> ''::"text"))), ''::"text"), COALESCE("string_agg"(DISTINCT "ps"."internal_notes", ' '::"text") FILTER (WHERE (("ps"."internal_notes" IS NOT NULL) AND ("ps"."internal_notes" <> ''::"text"))), ''::"text"), COALESCE("string_agg"(DISTINCT "ps"."supplier_sku", ' '::"text") FILTER (WHERE (("ps"."supplier_sku" IS NOT NULL) AND ("ps"."supplier_sku" <> ''::"text"))), ''::"text"), COALESCE("string_agg"(DISTINCT "ps"."order_confirmation_ref", ' '::"text") FILTER (WHERE (("ps"."order_confirmation_ref" IS NOT NULL) AND ("ps"."order_confirmation_ref" <> ''::"text"))), ''::"text")))) AS "search_blob"
           FROM (("public"."app_purchase_orders" "po"
             LEFT JOIN "public"."app_purchase_orders_positions_normal" "pn" ON (("pn"."order_id" = "po"."id")))
             LEFT JOIN "public"."app_purchase_orders_positions_special" "ps" ON (("ps"."order_id" = "po"."id")))
          GROUP BY "po"."id", "po"."order_number", "po"."invoice_number", "po"."notes", "po"."supplier"
        ), "aggregated" AS (
         SELECT "po"."id" AS "order_id",
            "po"."order_number",
            "po"."status",
            "po"."supplier",
            "po"."shipping_cost_net",
            "po"."ordered_at",
            "po"."confirmed_at" AS "proforma_confirmed_at",
            "po"."dol_planned_at",
            "po"."dol_actual_at",
            "po"."invoice_number",
            "po"."invoice_date",
            "po"."separate_invoice_for_shipping_cost",
            "po"."notes",
            "po"."created_at",
            "po"."updated_at",
            (COALESCE("n"."qty_ordered_total", (0)::numeric) + COALESCE("s"."qty_ordered_total", (0)::numeric)) AS "qty_ordered_total",
            (COALESCE("n"."qty_received_total", (0)::numeric) + COALESCE("s"."qty_received_total", (0)::numeric)) AS "qty_received_total",
            (COALESCE("n"."qty_open_total", (0)::numeric) + COALESCE("s"."qty_open_total", (0)::numeric)) AS "qty_open_total",
            COALESCE("n"."count_positions_normal", (0)::bigint) AS "count_positions_normal",
            COALESCE("s"."count_positions_special", (0)::bigint) AS "count_positions_special",
            COALESCE("s"."count_sketch_pending", (0)::bigint) AS "count_sketch_pending",
            (COALESCE("n"."amount_net_normal", (0)::numeric) + COALESCE("s"."amount_net_special", (0)::numeric)) AS "total_amount_net",
            "se"."search_blob",
            "po"."confirmation_number"
           FROM ((("public"."app_purchase_orders" "po"
             LEFT JOIN "normal" "n" ON (("n"."order_id" = "po"."id")))
             LEFT JOIN "special" "s" ON (("s"."order_id" = "po"."id")))
             LEFT JOIN "search" "se" ON (("se"."order_id" = "po"."id")))
        )
 SELECT "aggregated"."order_id",
    "aggregated"."order_number",
    "aggregated"."status",
    "aggregated"."supplier",
    "aggregated"."shipping_cost_net",
    "aggregated"."ordered_at",
    "aggregated"."proforma_confirmed_at",
    "aggregated"."dol_planned_at",
    "aggregated"."dol_actual_at",
    "aggregated"."invoice_number",
    "aggregated"."invoice_date",
    "aggregated"."separate_invoice_for_shipping_cost",
    "aggregated"."notes",
    "aggregated"."created_at",
    "aggregated"."updated_at",
    "aggregated"."qty_ordered_total",
    "aggregated"."qty_received_total",
    "aggregated"."qty_open_total",
    "aggregated"."count_positions_normal",
    "aggregated"."count_positions_special",
    "aggregated"."count_sketch_pending",
    "aggregated"."total_amount_net",
    "aggregated"."search_blob",
    "aggregated"."confirmation_number"
   FROM "aggregated";


ALTER TABLE "public"."app_purchase_orders_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_stock_levels" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fk_stocks" bigint,
    "bb_StockCode" "text",
    "fk_products" bigint,
    "bb_StockCurrent" bigint,
    "bb_UnfullfilledAmount" numeric,
    "upsert_match_id" "text" NOT NULL,
    "qty_unsellable" bigint
);


ALTER TABLE "public"."app_stock_levels" OWNER TO "postgres";


ALTER TABLE "public"."app_stock_levels" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_stock_levels_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_stock_locations" (
    "id" bigint NOT NULL,
    "name" "text",
    "fk_app_stocks" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_stock_locations" OWNER TO "postgres";


ALTER TABLE "public"."app_stock_locations" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_stock_locations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_stocks" (
    "id" bigint NOT NULL,
    "bb_Name" "text",
    "bb_Description" "text",
    "bb_isDefault" boolean,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_stocks" OWNER TO "postgres";


ALTER TABLE "public"."app_stocks" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_stocks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_supplier_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_name" "text" NOT NULL,
    "role_title" "text",
    "email" "text",
    "phone" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fk_bb_supplier" "text"
);


ALTER TABLE "public"."app_supplier_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_suppliers" (
    "id" "text" NOT NULL,
    "short_code" "text",
    "email" "text",
    "phone" "text",
    "website" "text",
    "default_currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "payment_terms_days" integer DEFAULT 0 NOT NULL,
    "default_incoterm" "text",
    "default_leadtime_days" integer DEFAULT 0 NOT NULL,
    "vat_number" "text",
    "tax_country" "text",
    "address_line1" "text",
    "address_line2" "text",
    "postal_code" "text",
    "city" "text",
    "state_region" "text",
    "country" "text",
    "notes" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "default_order_channel" "public"."order_channel",
    "default_payment_method" "text",
    "separate_invoice_for_shipping_cost" boolean,
    "account_number" numeric
);


ALTER TABLE "public"."app_suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "entity_name" "text" NOT NULL,
    "entity_id" "text" NOT NULL,
    "old_values" "jsonb",
    "new_values" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "batch_id" "uuid"
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."audit_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."audit_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."audit_logs_id_seq" OWNED BY "public"."audit_logs"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."bom_recipes_id_seq1"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."bom_recipes_id_seq1" OWNER TO "postgres";


ALTER SEQUENCE "public"."bom_recipes_id_seq1" OWNED BY "public"."bom_recipes"."id";



CREATE MATERIALIZED VIEW "public"."export_current_purchase_prices" AS
 SELECT "p"."id",
    "p"."bb_sku",
    "p"."bb_is_bom",
    "p"."bb_is_active",
    "p"."bb_net_purchase_price",
    "p"."inventory_cagtegory",
    "p"."production_required"
   FROM "public"."app_products" "p"
  WITH NO DATA;


ALTER TABLE "public"."export_current_purchase_prices" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."export_wareneingang_mtl" AS
 SELECT "isi"."id" AS "inbound_item_id",
    "isi"."shipment_id",
    "isi"."order_id",
    "isi"."po_item_normal_id",
    "isi"."po_item_special_id",
    "iship"."delivered_at" AS "arrived_at",
    "date"("iship"."delivered_at") AS "arrival_date",
    "to_char"("iship"."delivered_at", 'YYYY-MM'::"text") AS "arrival_month",
    "po"."order_number",
    COALESCE("po"."invoice_number", 'fehlt'::"text") AS "invoice_number",
    "po"."invoice_date",
    "po"."supplier" AS "supplier_id",
    COALESCE("pn"."id", "ps"."id") AS "po_item_id",
        CASE
            WHEN ("pn"."id" IS NOT NULL) THEN 'normal'::"text"
            ELSE 'special'::"text"
        END AS "po_item_type",
    COALESCE("pn"."billbee_product_id", "ps"."billbee_product_id") AS "billbee_product_id",
    "prod"."bb_sku",
    "prod"."inventory_cagtegory",
    "isi"."quantity_delivered",
    COALESCE("pn"."qty_ordered", "ps"."qty_ordered") AS "qty_ordered",
    COALESCE("pn"."unit_price_net", "ps"."unit_price_net") AS "unit_price_net",
    "isi"."shipping_costs_proportional",
    (COALESCE("pn"."unit_price_net", "ps"."unit_price_net", (0)::numeric) * "isi"."quantity_delivered") AS "amount_net_item",
    COALESCE("isi"."shipping_costs_proportional", (0)::numeric) AS "amount_shipping_allocated",
    ((COALESCE("pn"."unit_price_net", "ps"."unit_price_net", (0)::numeric) * "isi"."quantity_delivered") + COALESCE("isi"."shipping_costs_proportional", (0)::numeric)) AS "amount_total"
   FROM ((((("public"."app_inbound_shipment_items" "isi"
     JOIN "public"."app_inbound_shipments" "iship" ON (("iship"."id" = "isi"."shipment_id")))
     JOIN "public"."app_purchase_orders" "po" ON (("po"."id" = "isi"."order_id")))
     LEFT JOIN "public"."app_purchase_orders_positions_normal" "pn" ON (("pn"."id" = "isi"."po_item_normal_id")))
     LEFT JOIN "public"."app_purchase_orders_positions_special" "ps" ON (("ps"."id" = "isi"."po_item_special_id")))
     LEFT JOIN "public"."app_products" "prod" ON (("prod"."id" = COALESCE("pn"."billbee_product_id", "ps"."billbee_product_id"))));


ALTER TABLE "public"."export_wareneingang_mtl" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integration_outbox" (
    "id" bigint NOT NULL,
    "topic" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "available_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."integration_outbox" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."integration_outbox_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."integration_outbox_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."integration_outbox_id_seq" OWNED BY "public"."integration_outbox"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."inventory_adjustments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."inventory_adjustments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."inventory_adjustments_id_seq" OWNED BY "public"."app_inventory_adjustments"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."inventory_counts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."inventory_counts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."inventory_counts_id_seq" OWNED BY "public"."app_inventory_counts"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."inventory_sessions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."inventory_sessions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."inventory_sessions_id_seq" OWNED BY "public"."app_inventory_sessions"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."inventory_snapshots_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."inventory_snapshots_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."inventory_snapshots_id_seq" OWNED BY "public"."app_inventory_snapshots"."id";



CREATE TABLE IF NOT EXISTS "public"."ops_sync_cursor" (
    "kind" "text" NOT NULL,
    "next_offset" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ops_sync_cursor" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ops_sync_runs" (
    "kind" "text" NOT NULL,
    "run_date" "date" NOT NULL,
    "status" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    CONSTRAINT "ops_sync_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."ops_sync_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ref_billbee_product_data_enrichment" (
    "id" bigint NOT NULL,
    "billbee_product_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category1" "text",
    "category2" "text",
    "category3" "text",
    "manufacturer" "text",
    "net_purchase_price" numeric
);


ALTER TABLE "public"."ref_billbee_product_data_enrichment" OWNER TO "postgres";


ALTER TABLE "public"."ref_billbee_product_data_enrichment" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."ref_billbee_product_data_enrichment_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ref_billbee_product_extension" (
    "billbee_product_id" bigint NOT NULL,
    "supplier_sku" "text",
    "purchase_details" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "counted_qty" numeric,
    "counted_at" "date"
);


ALTER TABLE "public"."ref_billbee_product_extension" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ref_billbee_products_mirror" (
    "id" bigint NOT NULL,
    "billbee_product_id" bigint NOT NULL,
    "sku" "text",
    "name" "text",
    "is_bom" boolean,
    "is_active" boolean,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ref_billbee_products_mirror" OWNER TO "postgres";


ALTER TABLE "public"."ref_billbee_products_mirror" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."ref_billbee_products_mirror_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."rpt_app_products_profitability" AS
 SELECT "p"."id",
    "p"."bb_sku",
    "p"."inventory_cagtegory",
    "p"."bb_Price",
    "p"."bb_Net",
    "br"."billbee_component_id"
   FROM ("public"."app_products" "p"
     LEFT JOIN "public"."bom_recipes" "br" ON (("p"."id" = "br"."billbee_bom_id")));


ALTER TABLE "public"."rpt_app_products_profitability" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."rpt_inbound_items_enriched" AS
 WITH "base" AS (
         SELECT "i"."id" AS "inbound_item_id",
            ("date_trunc"('month'::"text", "s"."delivered_at"))::"date" AS "month",
                CASE
                    WHEN ("i"."po_item_normal_id" IS NOT NULL) THEN 'Normal'::"text"
                    WHEN ("i"."po_item_special_id" IS NOT NULL) THEN 'Special'::"text"
                    ELSE 'Unbekannt'::"text"
                END AS "kind",
            "i"."quantity_delivered" AS "qty_delivered",
            COALESCE("n"."unit_price_net", "sps"."unit_price_net") AS "unit_price_net",
            "i"."shipping_costs_proportional",
            COALESCE("sps"."base_model_billbee_product_id", "n"."billbee_product_id", "sps"."billbee_product_id") AS "category_product_id"
           FROM ((("public"."app_inbound_shipment_items" "i"
             JOIN "public"."app_inbound_shipments" "s" ON (("s"."id" = "i"."shipment_id")))
             LEFT JOIN "public"."app_purchase_orders_positions_normal" "n" ON (("n"."id" = "i"."po_item_normal_id")))
             LEFT JOIN "public"."app_purchase_orders_positions_special" "sps" ON (("sps"."id" = "i"."po_item_special_id")))
          WHERE ("i"."item_status" IS DISTINCT FROM 'planned'::"public"."is_status")
        )
 SELECT "b"."inbound_item_id",
    "b"."month",
    "p"."bb_sku",
    "p"."fk_bb_supplier",
    COALESCE("p"."inventory_cagtegory", 'Unbekannt'::"text") AS "inventory_cagtegory",
    "b"."kind",
    "b"."qty_delivered",
    (("b"."qty_delivered" * COALESCE("b"."unit_price_net", (0)::numeric)))::numeric(14,2) AS "cost_goods_net",
    (COALESCE("b"."shipping_costs_proportional", (0)::numeric))::numeric(14,2) AS "cost_shipping_alloc",
    ((("b"."qty_delivered" * COALESCE("b"."unit_price_net", (0)::numeric)) + COALESCE("b"."shipping_costs_proportional", (0)::numeric)))::numeric(14,2) AS "cost_total"
   FROM ("base" "b"
     LEFT JOIN "public"."app_products" "p" ON (("p"."id" = "b"."category_product_id")));


ALTER TABLE "public"."rpt_inbound_items_enriched" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."rpt_inbound_items_monthly" AS
 SELECT "rpt_inbound_items_enriched"."month",
    "rpt_inbound_items_enriched"."inventory_cagtegory",
    "rpt_inbound_items_enriched"."kind",
    ("sum"("rpt_inbound_items_enriched"."qty_delivered"))::numeric(12,3) AS "qty_delivered_total",
    ("sum"("rpt_inbound_items_enriched"."cost_goods_net"))::numeric(14,2) AS "cost_goods_net_total",
    ("sum"("rpt_inbound_items_enriched"."cost_shipping_alloc"))::numeric(14,2) AS "cost_shipping_total",
    ("sum"("rpt_inbound_items_enriched"."cost_total"))::numeric(14,2) AS "cost_total"
   FROM "public"."rpt_inbound_items_enriched"
  GROUP BY "rpt_inbound_items_enriched"."month", "rpt_inbound_items_enriched"."inventory_cagtegory", "rpt_inbound_items_enriched"."kind"
  ORDER BY "rpt_inbound_items_enriched"."month", "rpt_inbound_items_enriched"."inventory_cagtegory", "rpt_inbound_items_enriched"."kind";


ALTER TABLE "public"."rpt_inbound_items_monthly" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."rpt_po_deliveries_by_month_and_category" AS
 WITH "normalized" AS (
         SELECT ("date_trunc"('month'::"text", "s"."delivered_at"))::"date" AS "delivery_month",
            ("s"."delivered_at")::"date" AS "delivery_date",
            "po"."invoice_number",
            "p"."inventory_cagtegory",
            "isi"."quantity_delivered" AS "qty_delivered",
            COALESCE("n"."unit_price_net", "sp"."unit_price_net", (0)::numeric) AS "unit_price_net",
            COALESCE("isi"."shipping_costs_proportional", (0)::numeric) AS "shipping_costs_proportional",
            "po"."supplier"
           FROM ((((("public"."app_inbound_shipment_items" "isi"
             JOIN "public"."app_inbound_shipments" "s" ON (("s"."id" = "isi"."shipment_id")))
             JOIN "public"."app_purchase_orders" "po" ON (("po"."id" = "isi"."order_id")))
             LEFT JOIN "public"."app_purchase_orders_positions_normal" "n" ON (("n"."id" = "isi"."po_item_normal_id")))
             LEFT JOIN "public"."app_purchase_orders_positions_special" "sp" ON (("sp"."id" = "isi"."po_item_special_id")))
             JOIN "public"."app_products" "p" ON (("p"."id" = COALESCE("n"."billbee_product_id", "sp"."billbee_product_id"))))
        )
 SELECT "normalized"."delivery_month",
    "normalized"."invoice_number",
    "normalized"."inventory_cagtegory",
    "normalized"."supplier",
    "array_agg"(DISTINCT "normalized"."delivery_date" ORDER BY "normalized"."delivery_date") AS "delivery_dates",
    ("sum"(("normalized"."qty_delivered" * ("normalized"."unit_price_net" + "normalized"."shipping_costs_proportional"))))::numeric(14,2) AS "delivered_sum_net",
    ("sum"("normalized"."qty_delivered"))::numeric(14,3) AS "delivered_qty"
   FROM "normalized"
  GROUP BY "normalized"."delivery_month", "normalized"."invoice_number", "normalized"."inventory_cagtegory", "normalized"."supplier"
  ORDER BY "normalized"."delivery_month", "normalized"."invoice_number", "normalized"."inventory_cagtegory", "normalized"."supplier";


ALTER TABLE "public"."rpt_po_deliveries_by_month_and_category" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."rpt_product_sales_with_bom" AS
 WITH "bom_unit_cost" AS (
         SELECT "bom"."id" AS "bom_product_id",
            "sum"(("br"."quantity" * COALESCE("comp"."bb_net_purchase_price", (0)::numeric))) AS "unit_cost_bom"
           FROM (("public"."app_products" "bom"
             JOIN "public"."bom_recipes" "br" ON (("br"."billbee_bom_id" = "bom"."id")))
             JOIN "public"."app_products" "comp" ON (("comp"."id" = "br"."billbee_component_id")))
          GROUP BY "bom"."id"
        ), "direct_sales" AS (
         SELECT "p"."id" AS "product_id",
            "p"."bb_sku" AS "sku",
            "p"."inventory_cagtegory",
            "p"."production_required",
            (COALESCE(("oi"."bb_Quantity")::integer, 0))::numeric AS "qty_direct",
            COALESCE("oi"."bb_TotalPrice", (0)::numeric) AS "revenue_gross",
            (COALESCE("oi"."bb_TotalPrice", (0)::numeric) - COALESCE("oi"."bb_TaxAmount", (0)::numeric)) AS "revenue_net",
            (0)::numeric AS "qty_via_bom",
            ((COALESCE(("oi"."bb_Quantity")::integer, 0))::numeric * COALESCE(
                CASE
                    WHEN (COALESCE("p"."bb_is_bom", false) = true) THEN "buc"."unit_cost_bom"
                    ELSE "p"."bb_net_purchase_price"
                END, (0)::numeric)) AS "materialkosten_direkt",
            (0)::numeric AS "materialkosten_ueber_bom"
           FROM ((("public"."app_order_items" "oi"
             JOIN "public"."app_products" "p" ON (("p"."id" = "oi"."fk_app_products_id")))
             JOIN "public"."app_orders" "o" ON (("o"."id" = "oi"."fk_app_orders_id")))
             LEFT JOIN "bom_unit_cost" "buc" ON (("buc"."bom_product_id" = "p"."id")))
          WHERE ((COALESCE("oi"."bb_IsCoupon", false) = false) AND (COALESCE("p"."bb_is_active", false) = true) AND (COALESCE("p"."inventory_cagtegory", ''::"text") <> 'variant_set'::"text") AND ("date_trunc"('year'::"text", "o"."ordered_at") = "date_trunc"('year'::"text", "now"())) AND (COALESCE("p"."bb_category1", ''::"text") <> 'Antike Ware'::"text") AND (COALESCE("p"."bb_category2", ''::"text") <> 'Antike Ware'::"text") AND (COALESCE("p"."bb_category3", ''::"text") <> 'Antike Ware'::"text"))
        ), "bom_component_sales" AS (
         SELECT "comp"."id" AS "product_id",
            "comp"."bb_sku" AS "sku",
            "comp"."inventory_cagtegory",
            "comp"."production_required",
            (0)::numeric AS "qty_direct",
            (0)::numeric AS "revenue_gross",
            (0)::numeric AS "revenue_net",
            ((COALESCE(("oi"."bb_Quantity")::integer, 0))::numeric * "br"."quantity") AS "qty_via_bom",
            (0)::numeric AS "materialkosten_direkt",
            (0)::numeric AS "materialkosten_ueber_bom"
           FROM (((("public"."app_order_items" "oi"
             JOIN "public"."app_products" "bom" ON (("bom"."id" = "oi"."fk_app_products_id")))
             JOIN "public"."bom_recipes" "br" ON (("br"."billbee_bom_id" = "bom"."id")))
             JOIN "public"."app_products" "comp" ON (("comp"."id" = "br"."billbee_component_id")))
             JOIN "public"."app_orders" "o" ON (("o"."id" = "oi"."fk_app_orders_id")))
          WHERE ((COALESCE("oi"."bb_IsCoupon", false) = false) AND (COALESCE("bom"."bb_is_bom", false) = true) AND (COALESCE("comp"."bb_is_active", false) = true) AND (COALESCE("comp"."inventory_cagtegory", ''::"text") <> 'variant_set'::"text") AND ("date_trunc"('year'::"text", "o"."ordered_at") = "date_trunc"('year'::"text", "now"())) AND (COALESCE("comp"."bb_category1", ''::"text") <> 'Antike Ware'::"text") AND (COALESCE("comp"."bb_category2", ''::"text") <> 'Antike Ware'::"text") AND (COALESCE("comp"."bb_category3", ''::"text") <> 'Antike Ware'::"text"))
        ), "combined" AS (
         SELECT "direct_sales"."product_id",
            "direct_sales"."sku",
            "direct_sales"."inventory_cagtegory",
            "direct_sales"."production_required",
            "direct_sales"."qty_direct",
            "direct_sales"."revenue_gross",
            "direct_sales"."revenue_net",
            "direct_sales"."qty_via_bom",
            "direct_sales"."materialkosten_direkt",
            "direct_sales"."materialkosten_ueber_bom"
           FROM "direct_sales"
        UNION ALL
         SELECT "bom_component_sales"."product_id",
            "bom_component_sales"."sku",
            "bom_component_sales"."inventory_cagtegory",
            "bom_component_sales"."production_required",
            "bom_component_sales"."qty_direct",
            "bom_component_sales"."revenue_gross",
            "bom_component_sales"."revenue_net",
            "bom_component_sales"."qty_via_bom",
            "bom_component_sales"."materialkosten_direkt",
            "bom_component_sales"."materialkosten_ueber_bom"
           FROM "bom_component_sales"
        ), "combined_agg" AS (
         SELECT "c"."product_id" AS "id",
            "c"."sku",
            "c"."inventory_cagtegory",
            "c"."production_required",
            "sum"("c"."qty_direct") AS "verkauft_direkt",
            "sum"("c"."revenue_gross") AS "umsatz_brutto",
            "sum"("c"."revenue_net") AS "umsatz_netto",
            "sum"("c"."qty_via_bom") AS "verkauft_ueber_bom",
            "sum"("c"."materialkosten_direkt") AS "materialkosten_direkt",
            "sum"("c"."materialkosten_ueber_bom") AS "materialkosten_ueber_bom"
           FROM "combined" "c"
          GROUP BY "c"."product_id", "c"."sku", "c"."inventory_cagtegory", "c"."production_required"
        ), "special_costs" AS (
         SELECT COALESCE("s"."billbee_product_id", "s_base"."billbee_product_id") AS "product_id",
            "sum"((("isi"."quantity_delivered" * COALESCE("s"."unit_price_net", (0)::numeric)) + COALESCE("isi"."shipping_costs_proportional", (0)::numeric))) AS "materialkosten_sonder"
           FROM (((("public"."app_inbound_shipment_items" "isi"
             JOIN "public"."app_purchase_orders_positions_special" "s" ON (("s"."id" = "isi"."po_item_special_id")))
             LEFT JOIN "public"."app_purchase_orders_positions_special" "s_base" ON (("s_base"."id" = "isi"."po_item_special_id")))
             LEFT JOIN "public"."app_orders" "o" ON (("o"."id" = "s"."fk_app_orders_id")))
             LEFT JOIN "public"."app_products" "p" ON (("p"."id" = COALESCE("s"."billbee_product_id", "s_base"."billbee_product_id"))))
          WHERE (("o"."ordered_at" IS NOT NULL) AND ("date_trunc"('year'::"text", "o"."ordered_at") = "date_trunc"('year'::"text", "now"())) AND (COALESCE("p"."bb_category1", ''::"text") <> 'Antike Ware'::"text") AND (COALESCE("p"."bb_category2", ''::"text") <> 'Antike Ware'::"text") AND (COALESCE("p"."bb_category3", ''::"text") <> 'Antike Ware'::"text"))
          GROUP BY COALESCE("s"."billbee_product_id", "s_base"."billbee_product_id")
        )
 SELECT "ca"."id",
    "ca"."sku",
    "ca"."inventory_cagtegory",
    "ca"."production_required",
    "ca"."verkauft_direkt",
    "ca"."umsatz_brutto",
    "ca"."umsatz_netto",
    "ca"."verkauft_ueber_bom",
    "ca"."materialkosten_direkt",
    "ca"."materialkosten_ueber_bom",
    COALESCE("sc"."materialkosten_sonder", (0)::numeric) AS "materialkosten_sonder",
    (("ca"."materialkosten_direkt" + "ca"."materialkosten_ueber_bom") + COALESCE("sc"."materialkosten_sonder", (0)::numeric)) AS "materialkosten_gesamt",
        CASE
            WHEN ("ca"."umsatz_netto" <> (0)::numeric) THEN ((("ca"."materialkosten_direkt" + "ca"."materialkosten_ueber_bom") + COALESCE("sc"."materialkosten_sonder", (0)::numeric)) / "ca"."umsatz_netto")
            ELSE NULL::numeric
        END AS "materialkostenquote"
   FROM ("combined_agg" "ca"
     LEFT JOIN "special_costs" "sc" ON (("sc"."product_id" = "ca"."id")));


ALTER TABLE "public"."rpt_product_sales_with_bom" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stg_billbee_stock" (
    "billbee_product_id" bigint NOT NULL,
    "sku" "text",
    "stock_available" integer DEFAULT 0 NOT NULL,
    "stock_unavailable" integer DEFAULT 0 NOT NULL,
    "pulled_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stg_billbee_stock" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stg_billbee_stock_committed" (
    "billbee_product_id" bigint NOT NULL,
    "committed_qty" integer DEFAULT 0 NOT NULL,
    "pulled_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stg_billbee_stock_committed" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."rpt_products_inventory_purchasing" AS
 WITH "reserved_bom_by_component" AS (
         SELECT "r"."billbee_component_id",
            "sum"((("c_1"."committed_qty")::numeric * "r"."quantity")) AS "reserved_bom"
           FROM ("public"."bom_recipes" "r"
             JOIN "public"."stg_billbee_stock_committed" "c_1" ON (("c_1"."billbee_product_id" = "r"."billbee_bom_id")))
          GROUP BY "r"."billbee_component_id"
        ), "po_received_normal" AS (
         SELECT "isi"."po_item_normal_id" AS "po_item_id",
            "sum"("isi"."quantity_delivered") AS "qty_received"
           FROM "public"."app_inbound_shipment_items" "isi"
          WHERE ("isi"."po_item_normal_id" IS NOT NULL)
          GROUP BY "isi"."po_item_normal_id"
        ), "po_open_normal" AS (
         SELECT "p"."billbee_product_id",
            GREATEST((("p"."qty_ordered")::numeric - COALESCE("r"."qty_received", (0)::numeric)), (0)::numeric) AS "qty_open",
            "p"."po_item_status"
           FROM ("public"."app_purchase_orders_positions_normal" "p"
             LEFT JOIN "po_received_normal" "r" ON (("r"."po_item_id" = "p"."id")))
          WHERE ("p"."po_item_status" <> ALL (ARRAY['delivered'::"public"."po_item_status", 'cancelled'::"public"."po_item_status", 'paused'::"public"."po_item_status"]))
        ), "po_agg" AS (
         SELECT "po_open_normal"."billbee_product_id",
            "sum"("po_open_normal"."qty_open") AS "qty_on_order"
           FROM "po_open_normal"
          GROUP BY "po_open_normal"."billbee_product_id"
        )
 SELECT "ap"."id" AS "product_id",
    "ap"."bb_sku" AS "sku",
    "ap"."bb_name" AS "name",
        CASE
            WHEN ("ap"."bb_category1" = ANY (ARRAY['Armatur'::"text", 'Elektrogeräte'::"text", 'Küche'::"text", 'Naturstein'::"text", 'Schrank'::"text", 'Spiegel'::"text", 'TV'::"text", 'TV-Zubehör'::"text", 'WB'::"text", 'Wohnmöbel'::"text", 'WT'::"text", 'Zubehör'::"text"])) THEN "ap"."bb_category1"
            WHEN ("ap"."bb_category2" = ANY (ARRAY['Armatur'::"text", 'Elektrogeräte'::"text", 'Küche'::"text", 'Naturstein'::"text", 'Schrank'::"text", 'Spiegel'::"text", 'TV'::"text", 'TV-Zubehör'::"text", 'WB'::"text", 'Wohnmöbel'::"text", 'WT'::"text", 'Zubehör'::"text"])) THEN "ap"."bb_category2"
            WHEN ("ap"."bb_category3" = ANY (ARRAY['Armatur'::"text", 'Elektrogeräte'::"text", 'Küche'::"text", 'Naturstein'::"text", 'Schrank'::"text", 'Spiegel'::"text", 'TV'::"text", 'TV-Zubehör'::"text", 'WB'::"text", 'Wohnmöbel'::"text", 'WT'::"text", 'Zubehör'::"text"])) THEN "ap"."bb_category3"
            ELSE NULL::"text"
        END AS "bb_category",
    "ap"."inventory_cagtegory",
    "ap"."fk_bb_supplier" AS "supplier",
    ((COALESCE("ap"."bb_category1", ''::"text") ~~* '%On Demand - Externe Bestellung/Produktion erforderlich%'::"text") OR (COALESCE("ap"."bb_category2", ''::"text") ~~* '%On Demand - Externe Bestellung/Produktion erforderlich%'::"text") OR (COALESCE("ap"."bb_category3", ''::"text") ~~* '%On Demand - Externe Bestellung/Produktion erforderlich%'::"text")) AS "on_demand",
    COALESCE("s"."stock_available", 0) AS "stock_free",
    COALESCE("c"."committed_qty", 0) AS "stock_reserved_direct",
    COALESCE("rb"."reserved_bom", (0)::numeric) AS "stock_reserved_bom",
    COALESCE("s"."stock_unavailable", 0) AS "stock_unavailable",
    ((((COALESCE("s"."stock_available", 0))::numeric + (COALESCE("c"."committed_qty", 0))::numeric) + COALESCE("rb"."reserved_bom", (0)::numeric)) + (COALESCE("s"."stock_unavailable", 0))::numeric) AS "stock_physical",
    COALESCE("po"."qty_on_order", (0)::numeric) AS "stock_on_order",
    COALESCE("ap"."bb_net_purchase_price", (0)::numeric) AS "unit_cost_net",
    ((((((COALESCE("s"."stock_available", 0))::numeric + (COALESCE("c"."committed_qty", 0))::numeric) + COALESCE("rb"."reserved_bom", (0)::numeric)) + (COALESCE("s"."stock_unavailable", 0))::numeric) * COALESCE("ap"."bb_net_purchase_price", (0)::numeric)))::numeric(18,2) AS "inventory_value",
    (0)::numeric AS "counted_qty",
    NULL::timestamp with time zone AS "counted_at",
    ("cs3"."qty_sold_last_3_months")::integer AS "consumption_3m_rolling",
    GREATEST(COALESCE("s"."pulled_at", ('1970-01-01 00:00:00'::timestamp without time zone AT TIME ZONE 'UTC'::"text")), COALESCE("c"."pulled_at", ('1970-01-01 00:00:00'::timestamp without time zone AT TIME ZONE 'UTC'::"text"))) AS "updated_at"
   FROM ((((("public"."app_products" "ap"
     LEFT JOIN "public"."stg_billbee_stock" "s" ON (("s"."billbee_product_id" = "ap"."id")))
     LEFT JOIN "public"."stg_billbee_stock_committed" "c" ON (("c"."billbee_product_id" = "ap"."id")))
     LEFT JOIN "reserved_bom_by_component" "rb" ON (("rb"."billbee_component_id" = "ap"."id")))
     LEFT JOIN "po_agg" "po" ON (("po"."billbee_product_id" = "ap"."id")))
     LEFT JOIN "public"."app_component_sales_last_3_months" "cs3" ON (("cs3"."fk_app_products_id" = "ap"."id")))
  WHERE ((COALESCE("ap"."bb_is_bom", false) = false) AND (COALESCE("ap"."bb_is_active", true) = true) AND (NOT ((COALESCE("ap"."bb_category1", ''::"text") ~~* '%Antike Ware%'::"text") OR (COALESCE("ap"."bb_category2", ''::"text") ~~* '%Antike Ware%'::"text") OR (COALESCE("ap"."bb_category3", ''::"text") ~~* '%Antike Ware%'::"text"))));


ALTER TABLE "public"."rpt_products_inventory_purchasing" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."rpt_products_inventory_grouped" AS
 SELECT "d"."bb_category",
    "min"("d"."inventory_cagtegory") AS "inventory_cagtegory_sort",
    "count"(*) AS "product_count",
    "sum"("d"."stock_free") AS "stock_free",
    "sum"("d"."stock_reserved_direct") AS "stock_reserved_direct",
    "sum"("d"."stock_reserved_bom") AS "stock_reserved_bom",
    "sum"("d"."stock_unavailable") AS "stock_unavailable",
    "sum"("d"."stock_physical") AS "stock_physical",
    "sum"("d"."stock_on_order") AS "stock_on_order",
    "sum"("d"."inventory_value") AS "inventory_value",
    "min"("d"."updated_at") AS "updated_at_min",
    "max"("d"."updated_at") AS "updated_at_max"
   FROM "public"."rpt_products_inventory_purchasing" "d"
  GROUP BY "d"."bb_category"
  ORDER BY ("min"("d"."inventory_cagtegory")), "d"."bb_category";


ALTER TABLE "public"."rpt_products_inventory_grouped" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."seq_app_purchase_orders"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."seq_app_purchase_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone,
    "username" "text",
    "full_name" "text",
    "avatar_url" "text"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_bom_materialcosts" AS
 WITH "bom_material_costs" AS (
         SELECT "bom"."billbee_bom_id",
            COALESCE("sum"("comp"."bb_net_purchase_price"), (0)::numeric) AS "bom_material_cost"
           FROM ("public"."bom_recipes" "bom"
             LEFT JOIN "public"."app_products" "comp" ON (("bom"."billbee_component_id" = "comp"."id")))
          GROUP BY "bom"."billbee_bom_id"
        )
 SELECT "bmc"."billbee_bom_id",
    "parent"."bb_sku",
    "parent"."production_required",
    "parent"."inventory_cagtegory",
    "parent"."bb_Net",
    "parent"."bb_Price",
    "bmc"."bom_material_cost",
        CASE
            WHEN (("parent"."bb_Net" IS NULL) OR ("parent"."bb_Net" = (0)::numeric)) THEN NULL::numeric
            ELSE ("bmc"."bom_material_cost" / "parent"."bb_Net")
        END AS "bom_material_cost_ratio"
   FROM ("bom_material_costs" "bmc"
     LEFT JOIN "public"."app_products" "parent" ON (("bmc"."billbee_bom_id" = "parent"."id")));


ALTER TABLE "public"."view_bom_materialcosts" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_inventory_sessions_with_product_count" AS
 SELECT "s"."id",
    "s"."name",
    "s"."note",
    "s"."status",
    "s"."created_at",
    "s"."counting_started_at",
    "s"."snapshot_taken_at",
    "s"."closed_at",
    COALESCE("p"."product_count", (0)::bigint) AS "countable_products",
    COALESCE("c"."counted_products", (0)::bigint) AS "counted_products"
   FROM (("public"."app_inventory_sessions" "s"
     LEFT JOIN ( SELECT "app_inventory_snapshots"."session_id",
            "count"(DISTINCT "app_inventory_snapshots"."fk_products") AS "product_count"
           FROM "public"."app_inventory_snapshots"
          GROUP BY "app_inventory_snapshots"."session_id") "p" ON (("p"."session_id" = "s"."id")))
     LEFT JOIN ( SELECT "app_inventory_counts"."session_id",
            "count"(DISTINCT "app_inventory_counts"."fk_products") AS "counted_products"
           FROM "public"."app_inventory_counts"
          GROUP BY "app_inventory_counts"."session_id") "c" ON (("c"."session_id" = "s"."id")));


ALTER TABLE "public"."view_inventory_sessions_with_product_count" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_inventory_stock_level_comparison" AS
 WITH "snapshot_agg" AS (
         SELECT "s"."session_id",
            "s"."fk_stocks",
            "s"."fk_products",
            "s"."stock_location",
            "sum"(("s"."bb_stock_current" + COALESCE("s"."bb_unfullfilled_amount", (0)::numeric))) AS "snapshot_qty_sellable",
            "sum"(COALESCE(("s"."qty_unsellable")::numeric, (0)::numeric)) AS "snapshot_qty_unsellable"
           FROM "public"."app_inventory_snapshots" "s"
          GROUP BY "s"."session_id", "s"."fk_stocks", "s"."fk_products", "s"."stock_location"
        ), "count_agg" AS (
         SELECT "c"."session_id",
            "c"."fk_stocks",
            "c"."fk_products",
            "c"."stock_location",
            "sum"("c"."qty_sellable") AS "counted_qty_sellable",
            "sum"("c"."qty_unsellable") AS "counted_qty_unsellable"
           FROM "public"."app_inventory_counts" "c"
          GROUP BY "c"."session_id", "c"."fk_stocks", "c"."fk_products", "c"."stock_location"
        )
 SELECT COALESCE("sa"."session_id", "ca"."session_id") AS "session_id",
    COALESCE("sa"."fk_stocks", "ca"."fk_stocks") AS "fk_stocks",
    COALESCE("sa"."fk_products", "ca"."fk_products") AS "fk_products",
    "ca"."stock_location",
    "p"."bb_sku",
    "p"."product_type",
    "p"."inventory_cagtegory" AS "inventory_category",
    "sa"."snapshot_qty_sellable",
    "sa"."snapshot_qty_unsellable",
    "ca"."counted_qty_sellable",
    "ca"."counted_qty_unsellable",
    ("ca"."counted_qty_sellable" - "sa"."snapshot_qty_sellable") AS "diff_qty_sellable",
    ("ca"."counted_qty_unsellable" - "sa"."snapshot_qty_unsellable") AS "diff_qty_unsellable"
   FROM (("snapshot_agg" "sa"
     FULL JOIN "count_agg" "ca" ON ((("ca"."session_id" = "sa"."session_id") AND ("ca"."fk_stocks" = "sa"."fk_stocks") AND ("ca"."fk_products" = "sa"."fk_products"))))
     LEFT JOIN "public"."app_products" "p" ON (("p"."id" = COALESCE("sa"."fk_products", "ca"."fk_products"))));


ALTER TABLE "public"."view_inventory_stock_level_comparison" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_orders" AS
SELECT
    NULL::bigint AS "order_id",
    NULL::"text" AS "order_number",
    NULL::smallint AS "order_state",
    NULL::timestamp with time zone AS "ordered_at",
    NULL::"text" AS "bb_PayedAt",
    NULL::"text" AS "bb_InvoiceDate",
    NULL::"text" AS "shop_name",
    NULL::"text" AS "platform",
    NULL::"text" AS "customer_country",
    NULL::numeric AS "total_amount",
    NULL::bigint AS "total_quantity",
    NULL::boolean AS "has_special_item",
    NULL::boolean AS "has_production_required_item",
    NULL::smallint[] AS "shipping_profiles",
    NULL::interval AS "lead_time";


ALTER TABLE "public"."view_orders" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_orders_monthly_revenue" AS
 WITH "base" AS (
         SELECT "app_orders"."id",
            "app_orders"."bb_TotalCost" AS "total_cost",
            "date_trunc"('month'::"text", "app_orders"."ordered_at") AS "ordered_month",
            "date_trunc"('month'::"text", "app_orders"."offered_at") AS "offered_month",
            "date_trunc"('month'::"text", ("app_orders"."bb_InvoiceDate")::timestamp without time zone) AS "invoiced_month"
           FROM "public"."app_orders"
        )
 SELECT "t"."month",
    "sum"("t"."order_intake") AS "order_intake",
    "sum"("t"."offer_volume") AS "offer_volume",
    "sum"("t"."invoiced_revenue") AS "invoiced_revenue"
   FROM ( SELECT "base"."ordered_month" AS "month",
            "base"."total_cost" AS "order_intake",
            (0)::numeric AS "offer_volume",
            (0)::numeric AS "invoiced_revenue"
           FROM "base"
          WHERE ("base"."ordered_month" IS NOT NULL)
        UNION ALL
         SELECT "base"."offered_month",
            (0)::numeric AS "numeric",
            "base"."total_cost",
            (0)::numeric AS "numeric"
           FROM "base"
          WHERE ("base"."offered_month" IS NOT NULL)
        UNION ALL
         SELECT "base"."invoiced_month",
            (0)::numeric AS "numeric",
            (0)::numeric AS "numeric",
            "base"."total_cost"
           FROM "base"
          WHERE ("base"."invoiced_month" IS NOT NULL)) "t"
  GROUP BY "t"."month"
  ORDER BY "t"."month";


ALTER TABLE "public"."view_orders_monthly_revenue" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_orders_open_backlog_monthly" AS
 WITH "months" AS (
         SELECT "generate_series"("date_trunc"('month'::"text", "min"("app_orders"."ordered_at")), "date_trunc"('month'::"text", "now"()), '1 mon'::interval) AS "month"
           FROM "public"."app_orders"
        ), "orders" AS (
         SELECT "app_orders"."id",
            "app_orders"."bb_TotalCost" AS "total_cost",
            "app_orders"."ordered_at",
            ("app_orders"."bb_InvoiceDate")::timestamp without time zone AS "invoiced_at"
           FROM "public"."app_orders"
        )
 SELECT "m"."month",
    "count"("o"."id") AS "open_orders_count",
    "sum"("o"."total_cost") AS "open_order_value"
   FROM ("months" "m"
     LEFT JOIN "orders" "o" ON ((("o"."ordered_at" < ("m"."month" + '1 mon'::interval)) AND (("o"."invoiced_at" IS NULL) OR ("o"."invoiced_at" >= ("m"."month" + '1 mon'::interval))))))
  GROUP BY "m"."month"
  ORDER BY "m"."month";


ALTER TABLE "public"."view_orders_open_backlog_monthly" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_orders_open_delivery_backlog_monthly" AS
 WITH "months" AS (
         SELECT "generate_series"("date_trunc"('month'::"text", "min"("app_orders"."ordered_at")), "date_trunc"('month'::"text", "now"()), '1 mon'::interval) AS "month"
           FROM "public"."app_orders"
        ), "orders" AS (
         SELECT "app_orders"."id",
            "app_orders"."bb_TotalCost" AS "total_cost",
            "app_orders"."ordered_at",
            ("app_orders"."bb_ShippedAt")::timestamp without time zone AS "shipped_at"
           FROM "public"."app_orders"
          WHERE ("app_orders"."ordered_at" IS NOT NULL)
        )
 SELECT "m"."month",
    "count"("o"."id") AS "open_orders_count",
    "sum"("o"."total_cost") AS "open_order_value"
   FROM ("months" "m"
     LEFT JOIN "orders" "o" ON ((("o"."ordered_at" < ("m"."month" + '1 mon'::interval)) AND (("o"."shipped_at" IS NULL) OR ("o"."shipped_at" >= ("m"."month" + '1 mon'::interval))))))
  GROUP BY "m"."month"
  ORDER BY "m"."month";


ALTER TABLE "public"."view_orders_open_delivery_backlog_monthly" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_products" AS
 WITH "product_sales" AS (
         SELECT "p"."id",
            "p"."bb_sku",
            "p"."room",
            "p"."product_type",
            "p"."production_required",
            "p"."bb_net_purchase_price",
            "p"."bb_Net",
            "p"."bb_Price",
            "p"."bb_is_bom",
            "p"."is_variant_set",
            "p"."is_antique",
            COALESCE("sum"("oi_filtered"."bb_TotalPrice"), (0)::numeric) AS "revenue_last_12_months",
            COALESCE("sum"(("oi_filtered"."bb_Quantity")::numeric), (0)::numeric) AS "sales_last_12_months"
           FROM ("public"."app_products" "p"
             LEFT JOIN LATERAL ( SELECT "oi"."id",
                    "oi"."created_at",
                    "oi"."fk_app_orders_id",
                    "oi"."fk_app_products_id",
                    "oi"."bb_TransactionId",
                    "oi"."bb_Quantity",
                    "oi"."bb_TotalPrice",
                    "oi"."bb_TaxAmount",
                    "oi"."bb_TaxIndex",
                    "oi"."bb_Dicount",
                    "oi"."bb_GetPriceFromArticleIfAny",
                    "oi"."bb_IsCoupon",
                    "oi"."bb_ShippingProfileId",
                    "oi"."bb_DontAdjustStock",
                    "oi"."bb_UnrebatedTotalPrice",
                    "oi"."bb_SerialNumber",
                    "oi"."bb_InvoiceSKU",
                    "oi"."bb_StockId",
                    "o"."id",
                    "o"."created_at",
                    "o"."bb_OrderNumber",
                    "o"."bb_State",
                    "o"."bb_VatMode",
                    "o"."bb_CreatedAt",
                    "o"."offered_at",
                    "o"."bb_ConfirmedAt",
                    "o"."bb_ShippedAt",
                    "o"."bb_PayedAt",
                    "o"."bb_SellerComment",
                    "o"."bb_InvoiceNumberPrefix",
                    "o"."bb_InvoiceNumber",
                    "o"."bb_InvoiceDate",
                    "o"."bb_Currency",
                    "o"."bb_LastModifiedAt",
                    "o"."bb_WebUrl",
                    "o"."fk_app_customers_id",
                    "o"."bb_import_ab-nummer",
                    "o"."bb_Platform",
                    "o"."bb_BillbeeShopName",
                    "o"."ordered_at",
                    "o"."confirmed_at"
                   FROM ("public"."app_order_items" "oi"
                     JOIN "public"."app_orders" "o" ON (("o"."id" = "oi"."fk_app_orders_id")))
                  WHERE (("oi"."fk_app_products_id" = "p"."id") AND ("o"."ordered_at" >= ("now"() - '1 year'::interval)))) "oi_filtered"("id", "ordered_at", "fk_app_orders_id", "fk_app_products_id", "bb_TransactionId", "bb_Quantity", "bb_TotalPrice", "bb_TaxAmount", "bb_TaxIndex", "bb_Dicount", "bb_GetPriceFromArticleIfAny", "bb_IsCoupon", "bb_ShippingProfileId", "bb_DontAdjustStock", "bb_UnrebatedTotalPrice", "bb_SerialNumber", "bb_InvoiceSKU", "bb_StockId", "id_1", "created_at_1", "bb_OrderNumber", "bb_State", "bb_VatMode", "bb_CreatedAt", "offered_at", "bb_ConfirmedAt", "bb_ShippedAt", "bb_PayedAt", "bb_SellerComment", "bb_InvoiceNumberPrefix", "bb_InvoiceNumber", "bb_InvoiceDate", "bb_Currency", "bb_LastModifiedAt", "bb_WebUrl", "fk_app_customers_id", "bb_import_ab-nummer", "bb_Platform", "bb_BillbeeShopName", "ordered_at_1", "confirmed_at") ON (true))
          GROUP BY "p"."id", "p"."bb_sku", "p"."room", "p"."product_type", "p"."production_required", "p"."bb_net_purchase_price", "p"."bb_Net", "p"."bb_Price", "p"."bb_is_bom", "p"."is_variant_set", "p"."is_antique"
        ), "bom_material_costs" AS (
         SELECT "bom"."billbee_bom_id",
            COALESCE("sum"("comp"."bb_net_purchase_price"), (0)::numeric) AS "bom_material_cost"
           FROM ("public"."bom_recipes" "bom"
             LEFT JOIN "public"."app_products" "comp" ON (("bom"."billbee_component_id" = "comp"."id")))
          GROUP BY "bom"."billbee_bom_id"
        )
 SELECT "ps"."id",
    "ps"."bb_sku",
    "ps"."room",
    "ps"."product_type",
    "ps"."production_required",
    "ps"."bb_net_purchase_price",
    "ps"."bb_Net",
    "ps"."bb_Price",
    "ps"."revenue_last_12_months",
    "ps"."sales_last_12_months",
    "ps"."bb_is_bom",
    "bmc"."bom_material_cost",
        CASE
            WHEN (("ps"."bb_is_bom" = true) AND ("bmc"."bom_material_cost" IS NOT NULL)) THEN "bmc"."bom_material_cost"
            ELSE "ps"."bb_net_purchase_price"
        END AS "material_cost_per_unit",
    (
        CASE
            WHEN (("ps"."bb_is_bom" = true) AND ("bmc"."bom_material_cost" IS NOT NULL)) THEN "bmc"."bom_material_cost"
            ELSE "ps"."bb_net_purchase_price"
        END * "ps"."sales_last_12_months") AS "material_cost_last_12_months"
   FROM ("product_sales" "ps"
     LEFT JOIN "bom_material_costs" "bmc" ON (("bmc"."billbee_bom_id" = "ps"."id")))
  WHERE ((COALESCE("ps"."is_variant_set", false) = false) AND (COALESCE("ps"."is_antique", false) = false) AND ("ps"."room" <> 'Service'::"text"));


ALTER TABLE "public"."view_products" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_products_antique" AS
 WITH "product_sales" AS (
         SELECT "p"."id",
            "p"."bb_sku",
            "p"."room",
            "p"."product_type",
            "p"."production_required",
            "p"."bb_net_purchase_price",
            "p"."bb_Net",
            "p"."bb_Price",
            "p"."bb_is_bom",
            "p"."is_variant_set",
            "p"."is_antique",
            COALESCE("sum"("oi_filtered"."bb_TotalPrice"), (0)::numeric) AS "revenue_last_12_months",
            COALESCE("sum"(("oi_filtered"."bb_Quantity")::numeric), (0)::numeric) AS "sales_last_12_months"
           FROM ("public"."app_products" "p"
             LEFT JOIN LATERAL ( SELECT "oi"."id",
                    "oi"."created_at",
                    "oi"."fk_app_orders_id",
                    "oi"."fk_app_products_id",
                    "oi"."bb_TransactionId",
                    "oi"."bb_Quantity",
                    "oi"."bb_TotalPrice",
                    "oi"."bb_TaxAmount",
                    "oi"."bb_TaxIndex",
                    "oi"."bb_Dicount",
                    "oi"."bb_GetPriceFromArticleIfAny",
                    "oi"."bb_IsCoupon",
                    "oi"."bb_ShippingProfileId",
                    "oi"."bb_DontAdjustStock",
                    "oi"."bb_UnrebatedTotalPrice",
                    "oi"."bb_SerialNumber",
                    "oi"."bb_InvoiceSKU",
                    "oi"."bb_StockId",
                    "o"."id",
                    "o"."created_at",
                    "o"."bb_OrderNumber",
                    "o"."bb_State",
                    "o"."bb_VatMode",
                    "o"."bb_CreatedAt",
                    "o"."offered_at",
                    "o"."bb_ConfirmedAt",
                    "o"."bb_ShippedAt",
                    "o"."bb_PayedAt",
                    "o"."bb_SellerComment",
                    "o"."bb_InvoiceNumberPrefix",
                    "o"."bb_InvoiceNumber",
                    "o"."bb_InvoiceDate",
                    "o"."bb_Currency",
                    "o"."bb_LastModifiedAt",
                    "o"."bb_WebUrl",
                    "o"."fk_app_customers_id",
                    "o"."bb_import_ab-nummer",
                    "o"."bb_Platform",
                    "o"."bb_BillbeeShopName",
                    "o"."ordered_at",
                    "o"."confirmed_at"
                   FROM ("public"."app_order_items" "oi"
                     JOIN "public"."app_orders" "o" ON (("o"."id" = "oi"."fk_app_orders_id")))
                  WHERE (("oi"."fk_app_products_id" = "p"."id") AND ("o"."ordered_at" >= ("now"() - '1 year'::interval)))) "oi_filtered"("id", "ordered_at", "fk_app_orders_id", "fk_app_products_id", "bb_TransactionId", "bb_Quantity", "bb_TotalPrice", "bb_TaxAmount", "bb_TaxIndex", "bb_Dicount", "bb_GetPriceFromArticleIfAny", "bb_IsCoupon", "bb_ShippingProfileId", "bb_DontAdjustStock", "bb_UnrebatedTotalPrice", "bb_SerialNumber", "bb_InvoiceSKU", "bb_StockId", "id_1", "created_at_1", "bb_OrderNumber", "bb_State", "bb_VatMode", "bb_CreatedAt", "offered_at", "bb_ConfirmedAt", "bb_ShippedAt", "bb_PayedAt", "bb_SellerComment", "bb_InvoiceNumberPrefix", "bb_InvoiceNumber", "bb_InvoiceDate", "bb_Currency", "bb_LastModifiedAt", "bb_WebUrl", "fk_app_customers_id", "bb_import_ab-nummer", "bb_Platform", "bb_BillbeeShopName", "ordered_at_1", "confirmed_at") ON (true))
          GROUP BY "p"."id", "p"."bb_sku", "p"."room", "p"."product_type", "p"."production_required", "p"."bb_net_purchase_price", "p"."bb_Net", "p"."bb_Price", "p"."bb_is_bom", "p"."is_variant_set", "p"."is_antique"
        ), "bom_material_costs" AS (
         SELECT "bom"."billbee_bom_id",
            COALESCE("sum"("comp"."bb_net_purchase_price"), (0)::numeric) AS "bom_material_cost"
           FROM ("public"."bom_recipes" "bom"
             LEFT JOIN "public"."app_products" "comp" ON (("bom"."billbee_component_id" = "comp"."id")))
          GROUP BY "bom"."billbee_bom_id"
        )
 SELECT "ps"."id",
    "ps"."bb_sku",
    "ps"."room",
    "ps"."product_type",
    "ps"."production_required",
    "ps"."bb_net_purchase_price",
    "ps"."bb_Net",
    "ps"."bb_Price",
    "ps"."revenue_last_12_months",
    "ps"."sales_last_12_months",
    "ps"."bb_is_bom",
    "bmc"."bom_material_cost",
        CASE
            WHEN (("ps"."bb_is_bom" = true) AND ("bmc"."bom_material_cost" IS NOT NULL)) THEN "bmc"."bom_material_cost"
            ELSE "ps"."bb_net_purchase_price"
        END AS "material_cost_per_unit",
    (
        CASE
            WHEN (("ps"."bb_is_bom" = true) AND ("bmc"."bom_material_cost" IS NOT NULL)) THEN "bmc"."bom_material_cost"
            ELSE "ps"."bb_net_purchase_price"
        END * "ps"."sales_last_12_months") AS "material_cost_last_12_months"
   FROM ("product_sales" "ps"
     LEFT JOIN "bom_material_costs" "bmc" ON (("bmc"."billbee_bom_id" = "ps"."id")))
  WHERE ((COALESCE("ps"."is_variant_set", false) = false) AND (COALESCE("ps"."is_antique", false) = true) AND ("ps"."room" <> 'Service'::"text"));


ALTER TABLE "public"."view_products_antique" OWNER TO "postgres";


ALTER TABLE ONLY "internal"."sync_audit" ALTER COLUMN "id" SET DEFAULT "nextval"('"internal"."sync_audit_id_seq"'::"regclass");



ALTER TABLE ONLY "ops"."sync_runs" ALTER COLUMN "id" SET DEFAULT "nextval"('"ops"."sync_runs_id_seq"'::"regclass");



ALTER TABLE ONLY "ops"."sync_tasks_reservedamount" ALTER COLUMN "id" SET DEFAULT "nextval"('"ops"."sync_tasks_reservedamount_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."app_inventory_adjustments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."inventory_adjustments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."app_inventory_counts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."inventory_counts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."app_inventory_sessions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."inventory_sessions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."app_inventory_snapshots" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."inventory_snapshots_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."audit_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."audit_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."bom_recipes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."bom_recipes_id_seq1"'::"regclass");



ALTER TABLE ONLY "public"."integration_outbox" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."integration_outbox_id_seq"'::"regclass");



ALTER TABLE ONLY "internal"."cron_secrets"
    ADD CONSTRAINT "cron_secrets_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "internal"."cron_settings"
    ADD CONSTRAINT "cron_settings_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "internal"."sync_audit"
    ADD CONSTRAINT "sync_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "internal"."sync_state"
    ADD CONSTRAINT "sync_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ops"."sync_runs"
    ADD CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ops"."sync_tasks_reservedamount"
    ADD CONSTRAINT "sync_tasks_reservedamount_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ops"."sync_tasks_reservedamount"
    ADD CONSTRAINT "sync_tasks_reservedamount_run_id_billbee_product_id_key" UNIQUE ("run_id", "billbee_product_id");



ALTER TABLE ONLY "public"."app_complaints"
    ADD CONSTRAINT "app_complaints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_complaints_stages"
    ADD CONSTRAINT "app_complaints_stages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_complaints_stages"
    ADD CONSTRAINT "app_complaints_stages_state_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."app_customers"
    ADD CONSTRAINT "app_customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_inbound_shipment_items"
    ADD CONSTRAINT "app_inbound_shipment_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_inbound_shipments"
    ADD CONSTRAINT "app_inbound_shipments_inbound_number_key" UNIQUE ("inbound_number");



ALTER TABLE ONLY "public"."app_inbound_shipments"
    ADD CONSTRAINT "app_inbound_shipments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_order_item_attributes"
    ADD CONSTRAINT "app_order_item_attributes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_order_items"
    ADD CONSTRAINT "app_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_orders"
    ADD CONSTRAINT "app_order_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_products"
    ADD CONSTRAINT "app_products_bb_product_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."app_products_inventory_categories"
    ADD CONSTRAINT "app_products_inventory_categories_pkey" PRIMARY KEY ("inventory_category");



ALTER TABLE ONLY "public"."app_products"
    ADD CONSTRAINT "app_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_purchase_orders"
    ADD CONSTRAINT "app_purchase_orders_order_number_key" UNIQUE ("order_number");



ALTER TABLE ONLY "public"."app_purchase_orders"
    ADD CONSTRAINT "app_purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_purchase_orders_positions_normal"
    ADD CONSTRAINT "app_purchase_orders_positions_normal_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_purchase_orders_positions_special"
    ADD CONSTRAINT "app_purchase_orders_positions_special_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_stock_levels"
    ADD CONSTRAINT "app_stock_levels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_stock_levels"
    ADD CONSTRAINT "app_stock_levels_upsert_match_id_key" UNIQUE ("upsert_match_id");



ALTER TABLE ONLY "public"."app_stock_locations"
    ADD CONSTRAINT "app_stock_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_stocks"
    ADD CONSTRAINT "app_stocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_supplier_contacts"
    ADD CONSTRAINT "app_supplier_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_suppliers"
    ADD CONSTRAINT "app_suppliers_name_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."app_suppliers"
    ADD CONSTRAINT "app_suppliers_name_key1" UNIQUE ("id");



ALTER TABLE ONLY "public"."app_suppliers"
    ADD CONSTRAINT "app_suppliers_name_key2" UNIQUE ("id");



ALTER TABLE ONLY "public"."app_suppliers"
    ADD CONSTRAINT "app_suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_suppliers"
    ADD CONSTRAINT "app_suppliers_short_code_key" UNIQUE ("short_code");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bom_recipes"
    ADD CONSTRAINT "bom_recipes_billbee_bom_id_billbee_component_id_key" UNIQUE ("billbee_bom_id", "billbee_component_id");



ALTER TABLE ONLY "public"."bom_recipes"
    ADD CONSTRAINT "bom_recipes_pkey1" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integration_outbox"
    ADD CONSTRAINT "integration_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_inventory_counts"
    ADD CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_inventory_sessions"
    ADD CONSTRAINT "inventory_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_inventory_snapshots"
    ADD CONSTRAINT "inventory_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ops_sync_cursor"
    ADD CONSTRAINT "ops_sync_cursor_kind_key" UNIQUE ("kind");



ALTER TABLE ONLY "public"."ops_sync_cursor"
    ADD CONSTRAINT "ops_sync_cursor_pkey" PRIMARY KEY ("kind");



ALTER TABLE ONLY "public"."ops_sync_runs"
    ADD CONSTRAINT "ops_sync_runs_pkey" PRIMARY KEY ("kind", "run_date");



ALTER TABLE ONLY "public"."ref_billbee_product_data_enrichment"
    ADD CONSTRAINT "ref_billbee_product_data_enrichment_billbee_product_id_key" UNIQUE ("billbee_product_id");



ALTER TABLE ONLY "public"."ref_billbee_product_data_enrichment"
    ADD CONSTRAINT "ref_billbee_product_data_enrichment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ref_billbee_product_extension"
    ADD CONSTRAINT "ref_billbee_product_extension_pkey" PRIMARY KEY ("billbee_product_id");



ALTER TABLE ONLY "public"."ref_billbee_products_mirror"
    ADD CONSTRAINT "ref_billbee_products_mirror_billbee_product_id_key" UNIQUE ("billbee_product_id");



ALTER TABLE ONLY "public"."ref_billbee_products_mirror"
    ADD CONSTRAINT "ref_billbee_products_mirror_pkey" PRIMARY KEY ("billbee_product_id");



ALTER TABLE ONLY "public"."stg_billbee_stock_committed"
    ADD CONSTRAINT "stg_billbee_committed_direct_pkey" PRIMARY KEY ("billbee_product_id");



ALTER TABLE ONLY "public"."stg_billbee_stock_committed"
    ADD CONSTRAINT "stg_billbee_stock_committed_billbee_product_id_key" UNIQUE ("billbee_product_id");



ALTER TABLE ONLY "public"."stg_billbee_stock"
    ADD CONSTRAINT "stg_billbee_stock_pkey" PRIMARY KEY ("billbee_product_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");



CREATE INDEX "idx_tasks_run_status" ON "ops"."sync_tasks_reservedamount" USING "btree" ("run_id", "status", "priority", "id");



CREATE INDEX "app_inbound_shipments_supplier_id_idx" ON "public"."app_inbound_shipments" USING "btree" ("fk_bb_supplier");



CREATE INDEX "app_supplier_contacts_supplier_id_idx" ON "public"."app_supplier_contacts" USING "btree" ("fk_bb_supplier");



CREATE INDEX "idx_app_purchase_orders_supplier" ON "public"."app_purchase_orders" USING "btree" ("supplier");



CREATE INDEX "idx_bom_component" ON "public"."bom_recipes" USING "btree" ("billbee_component_id");



CREATE INDEX "idx_bom_parent" ON "public"."bom_recipes" USING "btree" ("billbee_bom_id");



CREATE INDEX "idx_inbound_shipment_items_shipping_costs" ON "public"."app_inbound_shipment_items" USING "btree" ("shipping_costs_proportional") WHERE ("shipping_costs_proportional" > (0)::numeric);



CREATE INDEX "idx_order_items_order" ON "public"."app_order_items" USING "btree" ("fk_app_orders_id");



CREATE INDEX "idx_order_items_product" ON "public"."app_order_items" USING "btree" ("fk_app_products_id");



CREATE INDEX "idx_po_dates" ON "public"."app_purchase_orders" USING "btree" ("ordered_at", "dol_planned_at", "invoice_date");



CREATE INDEX "idx_po_positions_normal_order" ON "public"."app_purchase_orders_positions_normal" USING "btree" ("order_id");



CREATE INDEX "idx_po_positions_normal_orders_link" ON "public"."app_purchase_orders_positions_normal" USING "btree" ("fk_app_orders_id");



CREATE INDEX "idx_po_positions_normal_product" ON "public"."app_purchase_orders_positions_normal" USING "btree" ("billbee_product_id");



CREATE INDEX "idx_po_positions_special_items_link" ON "public"."app_purchase_orders_positions_special" USING "btree" ("fk_app_order_items_id");



CREATE INDEX "idx_po_positions_special_order" ON "public"."app_purchase_orders_positions_special" USING "btree" ("order_id");



CREATE INDEX "idx_po_positions_special_orders_link" ON "public"."app_purchase_orders_positions_special" USING "btree" ("fk_app_orders_id");



CREATE INDEX "idx_po_positions_special_product" ON "public"."app_purchase_orders_positions_special" USING "btree" ("billbee_product_id");



CREATE INDEX "idx_po_status" ON "public"."app_purchase_orders" USING "btree" ("status");



CREATE INDEX "idx_ref_products_active" ON "public"."ref_billbee_products_mirror" USING "btree" ("is_active");



CREATE INDEX "idx_ref_products_bom" ON "public"."ref_billbee_products_mirror" USING "btree" ("is_bom");



CREATE INDEX "idx_rpt_products_full_active" ON "public"."ref_billbee_products_mirror" USING "btree" ("is_active");



CREATE INDEX "idx_rpt_products_full_bom" ON "public"."ref_billbee_products_mirror" USING "btree" ("is_bom");



CREATE INDEX "idx_stg_committed_pulled_at" ON "public"."stg_billbee_stock_committed" USING "btree" ("pulled_at");



CREATE INDEX "idx_stg_stock_pulled_at" ON "public"."stg_billbee_stock" USING "btree" ("pulled_at");



CREATE INDEX "idx_stock_levels_product" ON "public"."app_stock_levels" USING "btree" ("fk_products");



CREATE INDEX "idx_stock_levels_stock" ON "public"."app_stock_levels" USING "btree" ("fk_stocks");



CREATE INDEX "idx_suppliers_active" ON "public"."app_suppliers" USING "btree" ("active");



CREATE INDEX "idx_suppliers_name" ON "public"."app_suppliers" USING "gin" ("to_tsvector"('"simple"'::"regconfig", COALESCE("id", ''::"text")));



CREATE INDEX "inventory_adjustments_product_idx" ON "public"."app_inventory_adjustments" USING "btree" ("fk_products");



CREATE INDEX "inventory_adjustments_session_idx" ON "public"."app_inventory_adjustments" USING "btree" ("session_id");



CREATE INDEX "inventory_adjustments_status_idx" ON "public"."app_inventory_adjustments" USING "btree" ("status");



CREATE INDEX "inventory_adjustments_stock_idx" ON "public"."app_inventory_adjustments" USING "btree" ("fk_stocks");



CREATE INDEX "inventory_counts_product_idx" ON "public"."app_inventory_counts" USING "btree" ("fk_products");



CREATE INDEX "inventory_counts_session_idx" ON "public"."app_inventory_counts" USING "btree" ("session_id");



CREATE INDEX "inventory_counts_stock_idx" ON "public"."app_inventory_counts" USING "btree" ("fk_stocks");



CREATE INDEX "inventory_snapshots_product_idx" ON "public"."app_inventory_snapshots" USING "btree" ("fk_products");



CREATE INDEX "inventory_snapshots_session_idx" ON "public"."app_inventory_snapshots" USING "btree" ("session_id");



CREATE UNIQUE INDEX "inventory_snapshots_session_product_stock_uidx" ON "public"."app_inventory_snapshots" USING "btree" ("session_id", "fk_products", "fk_stocks");



CREATE INDEX "inventory_snapshots_stock_idx" ON "public"."app_inventory_snapshots" USING "btree" ("fk_stocks");



CREATE INDEX "ix_audit_logs_batch" ON "public"."audit_logs" USING "btree" ("batch_id");



CREATE INDEX "ix_audit_logs_createdat" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "ix_audit_logs_entity" ON "public"."audit_logs" USING "btree" ("entity_name", "entity_id");



CREATE INDEX "ix_inbound_items_normal" ON "public"."app_inbound_shipment_items" USING "btree" ("po_item_normal_id");



CREATE INDEX "ix_inbound_items_order" ON "public"."app_inbound_shipment_items" USING "btree" ("order_id");



CREATE INDEX "ix_inbound_items_special" ON "public"."app_inbound_shipment_items" USING "btree" ("po_item_special_id");



CREATE INDEX "ix_integration_outbox_status" ON "public"."integration_outbox" USING "btree" ("status", "available_at");



CREATE INDEX "ops_sync_runs_status_idx" ON "public"."ops_sync_runs" USING "btree" ("kind", "status", "run_date");



CREATE UNIQUE INDEX "ux_inbound_item_per_po_item" ON "public"."app_inbound_shipment_items" USING "btree" ("shipment_id", COALESCE("po_item_normal_id", "po_item_special_id"));



CREATE OR REPLACE VIEW "public"."view_orders" AS
 SELECT "o"."id" AS "order_id",
    "o"."bb_OrderNumber" AS "order_number",
    "o"."bb_State" AS "order_state",
    "o"."ordered_at",
    "o"."bb_PayedAt",
    "o"."bb_InvoiceDate",
    "o"."bb_BillbeeShopName" AS "shop_name",
    "o"."bb_Platform" AS "platform",
    "c"."bb_InvoiceAddress_CountryISO2" AS "customer_country",
    "sum"(COALESCE("oi"."bb_TotalPrice", (0)::numeric)) AS "total_amount",
    "sum"(COALESCE(("oi"."bb_Quantity")::integer, 0)) AS "total_quantity",
    "bool_or"(("p"."bb_name" ~~* '%Sonder%'::"text")) AS "has_special_item",
    "bool_or"(("p"."production_required" = 'Produktion erforderlich'::"text")) AS "has_production_required_item",
    "array_agg"(DISTINCT "oi"."bb_ShippingProfileId") AS "shipping_profiles",
        CASE
            WHEN (("o"."bb_InvoiceDate" IS NOT NULL) AND ("o"."ordered_at" IS NOT NULL)) THEN (("o"."bb_InvoiceDate")::timestamp with time zone - "o"."ordered_at")
            ELSE NULL::interval
        END AS "lead_time"
   FROM ((("public"."app_orders" "o"
     LEFT JOIN "public"."app_order_items" "oi" ON (("oi"."fk_app_orders_id" = "o"."id")))
     LEFT JOIN "public"."app_products" "p" ON (("oi"."fk_app_products_id" = "p"."id")))
     LEFT JOIN "public"."app_customers" "c" ON (("c"."id" = "o"."fk_app_customers_id")))
  GROUP BY "o"."id", "o"."bb_OrderNumber", "o"."bb_State", "o"."bb_BillbeeShopName", "o"."bb_Platform", "c"."bb_InvoiceAddress_CountryISO2";



CREATE OR REPLACE TRIGGER "app_orders_state_timestamps_trg" BEFORE INSERT OR UPDATE OF "bb_State" ON "public"."app_orders" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_app_orders_on_state_change_set_timestamps"();



CREATE OR REPLACE TRIGGER "trg_ai__allocate_shipping_costs_from_is" AFTER INSERT ON "public"."app_inbound_shipments" FOR EACH ROW WHEN (("new"."shipping_cost_separate" IS NOT NULL)) EXECUTE FUNCTION "public"."trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc"();



CREATE OR REPLACE TRIGGER "trg_ai__propagate_po_shipping_to_shipment" AFTER INSERT ON "public"."app_inbound_shipment_items" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_propagate_po_shipping_to_shipment"();



CREATE OR REPLACE TRIGGER "trg_ai_notify_n8n" AFTER INSERT ON "public"."integration_outbox" FOR EACH ROW EXECUTE FUNCTION "public"."fn_notify_n8n_new_entry"();



CREATE OR REPLACE TRIGGER "trg_aiud__audit_app_inbound_items" AFTER INSERT OR DELETE OR UPDATE ON "public"."app_inbound_shipment_items" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_generic_audit_logs_row_insert_update_delete_log"();



CREATE OR REPLACE TRIGGER "trg_aiud__audit_app_inbound_shipments" AFTER INSERT OR DELETE OR UPDATE ON "public"."app_inbound_shipments" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_generic_audit_logs_row_insert_update_delete_log"();



CREATE OR REPLACE TRIGGER "trg_aiud__refresh_po_item_status" AFTER INSERT OR DELETE OR UPDATE ON "public"."app_inbound_shipment_items" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_app_inbound_shipment_items_po_item_status_sync_from_poste"();



CREATE OR REPLACE TRIGGER "trg_app_po_assign_order_number" BEFORE INSERT ON "public"."app_purchase_orders" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_app_purchase_orders_order_number_assign"();



CREATE OR REPLACE TRIGGER "trg_app_purchase_orders_positions_normal_view_update" INSTEAD OF UPDATE ON "public"."app_purchase_orders_positions_normal_view" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_app_purchase_orders_positions_normal_view_update"();



CREATE OR REPLACE TRIGGER "trg_app_purchase_orders_positions_special_view_update" INSTEAD OF UPDATE ON "public"."app_purchase_orders_positions_special_view" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_app_purchase_orders_positions_special_view_update"();



CREATE OR REPLACE TRIGGER "trg_au__allocate_shipping_costs_from_is" AFTER UPDATE OF "shipping_cost_separate" ON "public"."app_inbound_shipments" FOR EACH ROW WHEN (("old"."shipping_cost_separate" IS DISTINCT FROM "new"."shipping_cost_separate")) EXECUTE FUNCTION "public"."trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc"();



CREATE OR REPLACE TRIGGER "trg_au__sync_is_status_to_items" AFTER UPDATE OF "status" ON "public"."app_inbound_shipments" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_app_inbound_shipments_status_sync_to_items"();



CREATE OR REPLACE TRIGGER "trg_au__update_product_price_on_posting" AFTER UPDATE OF "item_status" ON "public"."app_inbound_shipment_items" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_update_product_price_on_posting"();



CREATE OR REPLACE TRIGGER "trg_bi__assign_inbound_number" BEFORE INSERT ON "public"."app_inbound_shipments" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_app_inbound_shipments_inbound_number_assign"();



CREATE OR REPLACE TRIGGER "trg_bu__forbid_qty_after_posted" BEFORE UPDATE OF "quantity_delivered", "po_item_normal_id", "po_item_special_id" ON "public"."app_inbound_shipment_items" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_app_inbound_shipment_items_fks_quantity_delivered_restric"();



CREATE OR REPLACE TRIGGER "trg_bu__lock_sep_flag_after_cost" BEFORE UPDATE OF "separate_invoice_for_shipping_cost" ON "public"."app_purchase_orders" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_app_purchase_orders_separate_invoice_for_shipping_cost_re"();



CREATE OR REPLACE TRIGGER "trg_po_item_auto_advance_normal" AFTER UPDATE OF "po_item_status" ON "public"."app_purchase_orders_positions_normal" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_app_purchase_orders_positions_normal_po_item_status_auto_"();



CREATE OR REPLACE TRIGGER "trg_po_item_auto_advance_special" AFTER UPDATE OF "po_item_status" ON "public"."app_purchase_orders_positions_special" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_app_purchase_orders_positions_special_po_item_status_auto"();



CREATE OR REPLACE TRIGGER "trg_po_item_enforce_status_special" BEFORE UPDATE OF "po_item_status" ON "public"."app_purchase_orders_positions_special" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_app_purchase_orders_positions_po_item_status_restrict_tra"();



CREATE OR REPLACE TRIGGER "trg_po_recalc_shipping_on_status" AFTER UPDATE ON "public"."app_purchase_orders" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_app_purchase_orders_status_recalc_shipping_on_partially_i"();



CREATE OR REPLACE TRIGGER "trg_set_inventory_category" BEFORE INSERT OR UPDATE ON "public"."app_products" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_app_products_inventory_category_assign_from_bb_categories"();



CREATE OR REPLACE TRIGGER "trg_update_po_status_normal" AFTER INSERT OR DELETE OR UPDATE ON "public"."app_purchase_orders_positions_normal" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_app_purchase_orders_positions_status_trigger_recalc_po_st"();



CREATE OR REPLACE TRIGGER "trg_update_po_status_special" AFTER INSERT OR DELETE OR UPDATE ON "public"."app_purchase_orders_positions_special" FOR EACH ROW EXECUTE FUNCTION "public"."trgfn_app_purchase_orders_positions_status_trigger_recalc_po_st"();



ALTER TABLE ONLY "ops"."sync_tasks_reservedamount"
    ADD CONSTRAINT "sync_tasks_reservedamount_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ops"."sync_runs"("id");



ALTER TABLE ONLY "public"."app_complaints"
    ADD CONSTRAINT "app_complaints_fk_app_order_items_id_fkey" FOREIGN KEY ("fk_app_order_items_id") REFERENCES "public"."app_order_items"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."app_complaints"
    ADD CONSTRAINT "app_complaints_fk_app_orders_id_fkey" FOREIGN KEY ("fk_app_orders_id") REFERENCES "public"."app_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_complaints"
    ADD CONSTRAINT "app_complaints_stage_fkey" FOREIGN KEY ("stage") REFERENCES "public"."app_complaints_stages"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."app_inbound_shipment_items"
    ADD CONSTRAINT "app_inbound_shipment_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."app_purchase_orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."app_inbound_shipment_items"
    ADD CONSTRAINT "app_inbound_shipment_items_po_item_normal_id_fkey" FOREIGN KEY ("po_item_normal_id") REFERENCES "public"."app_purchase_orders_positions_normal"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."app_inbound_shipment_items"
    ADD CONSTRAINT "app_inbound_shipment_items_po_item_special_id_fkey" FOREIGN KEY ("po_item_special_id") REFERENCES "public"."app_purchase_orders_positions_special"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."app_inbound_shipment_items"
    ADD CONSTRAINT "app_inbound_shipment_items_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "public"."app_inbound_shipments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_inbound_shipments"
    ADD CONSTRAINT "app_inbound_shipments_fk_bb_supplier_fkey" FOREIGN KEY ("fk_bb_supplier") REFERENCES "public"."app_suppliers"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."app_inventory_counts"
    ADD CONSTRAINT "app_inventory_counts_stock_location_fkey" FOREIGN KEY ("stock_location") REFERENCES "public"."app_stock_locations"("id");



ALTER TABLE ONLY "public"."app_inventory_sessions"
    ADD CONSTRAINT "app_inventory_sessions_fk_stocks_fkey" FOREIGN KEY ("fk_stocks") REFERENCES "public"."app_stocks"("id");



ALTER TABLE ONLY "public"."app_inventory_snapshots"
    ADD CONSTRAINT "app_inventory_snapshots_fk_stocks_fkey" FOREIGN KEY ("fk_stocks") REFERENCES "public"."app_stocks"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_inventory_snapshots"
    ADD CONSTRAINT "app_inventory_snapshots_source_stock_level_id_fkey" FOREIGN KEY ("source_stock_level_id") REFERENCES "public"."app_stock_levels"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_order_item_attributes"
    ADD CONSTRAINT "app_order_item_attributes_fk_app_order_items_id_fkey" FOREIGN KEY ("fk_app_order_items_id") REFERENCES "public"."app_order_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_order_items"
    ADD CONSTRAINT "app_order_items_fk_app_orders_id_fkey" FOREIGN KEY ("fk_app_orders_id") REFERENCES "public"."app_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_order_items"
    ADD CONSTRAINT "app_order_items_fk_app_products_id_fkey" FOREIGN KEY ("fk_app_products_id") REFERENCES "public"."app_products"("id");



ALTER TABLE ONLY "public"."app_orders"
    ADD CONSTRAINT "app_orders_fk_app_customers_id_fkey" FOREIGN KEY ("fk_app_customers_id") REFERENCES "public"."app_customers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."app_products"
    ADD CONSTRAINT "app_products_fk_bb_supplier_fkey" FOREIGN KEY ("fk_bb_supplier") REFERENCES "public"."app_suppliers"("id");



ALTER TABLE ONLY "public"."app_products"
    ADD CONSTRAINT "app_products_inventory_cagtegory_fkey" FOREIGN KEY ("inventory_cagtegory") REFERENCES "public"."app_products_inventory_categories"("inventory_category");



ALTER TABLE ONLY "public"."app_purchase_orders_positions_special"
    ADD CONSTRAINT "app_purchase_orders_positions_base_model_billbee_product_i_fkey" FOREIGN KEY ("base_model_billbee_product_id") REFERENCES "public"."app_products"("id");



ALTER TABLE ONLY "public"."app_purchase_orders_positions_normal"
    ADD CONSTRAINT "app_purchase_orders_positions_normal_billbee_product_id_fkey" FOREIGN KEY ("billbee_product_id") REFERENCES "public"."app_products"("id");



ALTER TABLE ONLY "public"."app_purchase_orders_positions_normal"
    ADD CONSTRAINT "app_purchase_orders_positions_normal_fk_app_order_items_id_fkey" FOREIGN KEY ("fk_app_order_items_id") REFERENCES "public"."app_order_items"("id");



ALTER TABLE ONLY "public"."app_purchase_orders_positions_normal"
    ADD CONSTRAINT "app_purchase_orders_positions_normal_fk_app_orders_id_fkey" FOREIGN KEY ("fk_app_orders_id") REFERENCES "public"."app_orders"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."app_purchase_orders_positions_normal"
    ADD CONSTRAINT "app_purchase_orders_positions_normal_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."app_purchase_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_purchase_orders_positions_special"
    ADD CONSTRAINT "app_purchase_orders_positions_specia_fk_app_order_items_id_fkey" FOREIGN KEY ("fk_app_order_items_id") REFERENCES "public"."app_order_items"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."app_purchase_orders_positions_special"
    ADD CONSTRAINT "app_purchase_orders_positions_special_billbee_product_id_fkey" FOREIGN KEY ("billbee_product_id") REFERENCES "public"."app_products"("id");



ALTER TABLE ONLY "public"."app_purchase_orders_positions_special"
    ADD CONSTRAINT "app_purchase_orders_positions_special_fk_app_orders_id_fkey" FOREIGN KEY ("fk_app_orders_id") REFERENCES "public"."app_orders"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."app_purchase_orders_positions_special"
    ADD CONSTRAINT "app_purchase_orders_positions_special_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."app_purchase_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_purchase_orders"
    ADD CONSTRAINT "app_purchase_orders_supplier_fkey" FOREIGN KEY ("supplier") REFERENCES "public"."app_suppliers"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."app_stock_levels"
    ADD CONSTRAINT "app_stock_levels_fk_products_fkey" FOREIGN KEY ("fk_products") REFERENCES "public"."app_products"("id");



ALTER TABLE ONLY "public"."app_stock_levels"
    ADD CONSTRAINT "app_stock_levels_fk_stocks_fkey" FOREIGN KEY ("fk_stocks") REFERENCES "public"."app_stocks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_stock_locations"
    ADD CONSTRAINT "app_stock_locations_fk_app_stocks_fkey" FOREIGN KEY ("fk_app_stocks") REFERENCES "public"."app_stocks"("id");



ALTER TABLE ONLY "public"."app_supplier_contacts"
    ADD CONSTRAINT "app_supplier_contacts_fk_bb_supplier_fkey" FOREIGN KEY ("fk_bb_supplier") REFERENCES "public"."app_suppliers"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."bom_recipes"
    ADD CONSTRAINT "bom_recipes_billbee_bom_id_fkey" FOREIGN KEY ("billbee_bom_id") REFERENCES "public"."app_products"("id");



ALTER TABLE ONLY "public"."bom_recipes"
    ADD CONSTRAINT "bom_recipes_billbee_component_id_fkey" FOREIGN KEY ("billbee_component_id") REFERENCES "public"."app_products"("id");



ALTER TABLE ONLY "public"."app_inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_fk_products_fkey" FOREIGN KEY ("fk_products") REFERENCES "public"."app_products"("id");



ALTER TABLE ONLY "public"."app_inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_fk_stocks_fkey" FOREIGN KEY ("fk_stocks") REFERENCES "public"."app_stocks"("id");



ALTER TABLE ONLY "public"."app_inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."app_inventory_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_source_count_id_fkey" FOREIGN KEY ("source_count_id") REFERENCES "public"."app_inventory_counts"("id");



ALTER TABLE ONLY "public"."app_inventory_counts"
    ADD CONSTRAINT "inventory_counts_counted_by_fkey" FOREIGN KEY ("counted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."app_inventory_counts"
    ADD CONSTRAINT "inventory_counts_fk_products_fkey" FOREIGN KEY ("fk_products") REFERENCES "public"."app_products"("id");



ALTER TABLE ONLY "public"."app_inventory_counts"
    ADD CONSTRAINT "inventory_counts_fk_stocks_fkey" FOREIGN KEY ("fk_stocks") REFERENCES "public"."app_stocks"("id");



ALTER TABLE ONLY "public"."app_inventory_counts"
    ADD CONSTRAINT "inventory_counts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."app_inventory_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_inventory_snapshots"
    ADD CONSTRAINT "inventory_snapshots_fk_products_fkey" FOREIGN KEY ("fk_products") REFERENCES "public"."app_products"("id");



ALTER TABLE ONLY "public"."app_inventory_snapshots"
    ADD CONSTRAINT "inventory_snapshots_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."app_inventory_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ref_billbee_product_data_enrichment"
    ADD CONSTRAINT "ref_billbee_product_data_enrichment_billbee_product_id_fkey" FOREIGN KEY ("billbee_product_id") REFERENCES "public"."ref_billbee_products_mirror"("billbee_product_id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ref_billbee_product_extension"
    ADD CONSTRAINT "ref_billbee_product_extension_billbee_product_id_fkey" FOREIGN KEY ("billbee_product_id") REFERENCES "public"."ref_billbee_products_mirror"("billbee_product_id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stg_billbee_stock"
    ADD CONSTRAINT "stg_billbee_stock_billbee_product_id_fkey" FOREIGN KEY ("billbee_product_id") REFERENCES "public"."app_products"("id");



ALTER TABLE ONLY "public"."stg_billbee_stock_committed"
    ADD CONSTRAINT "stg_billbee_stock_committed_billbee_product_id_fkey" FOREIGN KEY ("billbee_product_id") REFERENCES "public"."app_products"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE "public"."app_complaints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_complaints_stages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_inbound_shipment_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_inbound_shipments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_inventory_adjustments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_inventory_counts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_inventory_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_inventory_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_order_item_attributes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_products_inventory_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_purchase_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_purchase_orders_positions_normal" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_purchase_orders_positions_special" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_stock_levels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_stock_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_stocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_supplier_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_suppliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated" ON "public"."app_complaints" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_complaints_stages" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_customers" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_inbound_shipment_items" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_inbound_shipments" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_inventory_adjustments" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_inventory_counts" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_inventory_sessions" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_inventory_snapshots" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_order_item_attributes" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_order_items" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_orders" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_products" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_products_inventory_categories" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_purchase_orders" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_purchase_orders_positions_normal" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_purchase_orders_positions_special" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_stock_levels" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_stock_locations" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_stocks" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_supplier_contacts" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."app_suppliers" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."audit_logs" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."bom_recipes" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."integration_outbox" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."ops_sync_cursor" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."ops_sync_runs" TO "authenticated" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."ref_billbee_product_data_enrichment" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."ref_billbee_product_extension" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."ref_billbee_products_mirror" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."stg_billbee_stock" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."stg_billbee_stock_committed" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated" ON "public"."users" USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."bom_recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."integration_outbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ops_sync_cursor" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ops_sync_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ref_billbee_product_data_enrichment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ref_billbee_product_extension" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ref_billbee_products_mirror" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stg_billbee_stock" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stg_billbee_stock_committed" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."app_inventory_counts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."app_purchase_orders";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";





































































































































































































































































GRANT ALL ON FUNCTION "public"."audit_current_tag"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_current_tag"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_current_tag"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_app_purchase_orders_status_derive_from_items"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_app_purchase_orders_status_derive_from_items"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_app_purchase_orders_status_derive_from_items"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_app_purchase_orders_status_derive_from_items_old"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_app_purchase_orders_status_derive_from_items_old"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_app_purchase_orders_status_derive_from_items_old"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_is_post_and_dispatch"("p_inbound_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_is_post_and_dispatch"("p_inbound_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_is_post_and_dispatch"("p_inbound_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_notify_n8n_new_entry"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_notify_n8n_new_entry"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_notify_n8n_new_entry"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_util__audit_tag_get"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_util__audit_tag_get"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_util__audit_tag_get"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_util__audit_tag_set"("p_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_util__audit_tag_set"("p_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_util__audit_tag_set"("p_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_util__text_join_safe"("arr" "text"[], "sep" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_util__text_join_safe"("arr" "text"[], "sep" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_util__text_join_safe"("arr" "text"[], "sep" "text") TO "service_role";



GRANT ALL ON TABLE "public"."app_inventory_sessions" TO "anon";
GRANT ALL ON TABLE "public"."app_inventory_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."app_inventory_sessions" TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_app_inventory_session_start"("p_name" "text", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_app_inventory_session_start"("p_name" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_app_inventory_session_start"("p_name" "text", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_app_purchase_orders_positions_po_item_status_set_for_order"("p_order_id" "uuid", "p_status" "text", "p_dol_planned_at" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_app_purchase_orders_positions_po_item_status_set_for_order"("p_order_id" "uuid", "p_status" "text", "p_dol_planned_at" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_app_purchase_orders_positions_po_item_status_set_for_order"("p_order_id" "uuid", "p_status" "text", "p_dol_planned_at" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_app_purchase_orders_positions_special_sketch_confirm_and_ad"("p_item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_app_purchase_orders_positions_special_sketch_confirm_and_ad"("p_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_app_purchase_orders_positions_special_sketch_confirm_and_ad"("p_item_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_app_inbound_shipment_items_fks_quantity_delivered_restric"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_app_inbound_shipment_items_fks_quantity_delivered_restric"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_app_inbound_shipment_items_fks_quantity_delivered_restric"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_app_inbound_shipment_items_po_item_status_sync_from_poste"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_app_inbound_shipment_items_po_item_status_sync_from_poste"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_app_inbound_shipment_items_po_item_status_sync_from_poste"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_app_inbound_shipments_inbound_number_assign"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_app_inbound_shipments_inbound_number_assign"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_app_inbound_shipments_inbound_number_assign"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_app_inbound_shipments_status_sync_to_items"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_app_inbound_shipments_status_sync_to_items"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_app_inbound_shipments_status_sync_to_items"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_app_orders_on_state_change_set_timestamps"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_app_orders_on_state_change_set_timestamps"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_app_orders_on_state_change_set_timestamps"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_app_products_inventory_category_assign_from_bb_categories"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_app_products_inventory_category_assign_from_bb_categories"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_app_products_inventory_category_assign_from_bb_categories"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_order_number_assign"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_order_number_assign"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_order_number_assign"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_positions_normal_po_item_status_auto_"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_positions_normal_po_item_status_auto_"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_positions_normal_po_item_status_auto_"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_positions_normal_view_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_positions_normal_view_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_positions_normal_view_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_positions_po_item_status_restrict_tra"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_positions_po_item_status_restrict_tra"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_positions_po_item_status_restrict_tra"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_positions_special_po_item_status_auto"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_positions_special_po_item_status_auto"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_positions_special_po_item_status_auto"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_positions_special_view_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_positions_special_view_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_positions_special_view_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_positions_status_trigger_recalc_po_st"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_positions_status_trigger_recalc_po_st"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_positions_status_trigger_recalc_po_st"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_separate_invoice_for_shipping_cost_re"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_separate_invoice_for_shipping_cost_re"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_separate_invoice_for_shipping_cost_re"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_status_recalc_shipping_on_partially_i"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_status_recalc_shipping_on_partially_i"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_app_purchase_orders_status_recalc_shipping_on_partially_i"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_generic_audit_logs_row_insert_update_delete_log"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_generic_audit_logs_row_insert_update_delete_log"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_generic_audit_logs_row_insert_update_delete_log"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_generic_row_stamp_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_generic_row_stamp_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_generic_row_stamp_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_propagate_po_shipping_to_shipment"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_propagate_po_shipping_to_shipment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_propagate_po_shipping_to_shipment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trgfn_update_product_price_on_posting"() TO "anon";
GRANT ALL ON FUNCTION "public"."trgfn_update_product_price_on_posting"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trgfn_update_product_price_on_posting"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vwfn_app_purchase_orders_positions_normal_view_row_route_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."vwfn_app_purchase_orders_positions_normal_view_row_route_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."vwfn_app_purchase_orders_positions_normal_view_row_route_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vwfn_app_purchase_orders_positions_special_view_row_route_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."vwfn_app_purchase_orders_positions_special_view_row_route_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."vwfn_app_purchase_orders_positions_special_view_row_route_write"() TO "service_role";

































GRANT ALL ON TABLE "public"."app_complaints" TO "anon";
GRANT ALL ON TABLE "public"."app_complaints" TO "authenticated";
GRANT ALL ON TABLE "public"."app_complaints" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_complaints_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_complaints_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_complaints_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_complaints_stages" TO "anon";
GRANT ALL ON TABLE "public"."app_complaints_stages" TO "authenticated";
GRANT ALL ON TABLE "public"."app_complaints_stages" TO "service_role";



GRANT ALL ON TABLE "public"."app_order_items" TO "anon";
GRANT ALL ON TABLE "public"."app_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."app_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."app_orders" TO "anon";
GRANT ALL ON TABLE "public"."app_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."app_orders" TO "service_role";



GRANT ALL ON TABLE "public"."bom_recipes" TO "anon";
GRANT ALL ON TABLE "public"."bom_recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."bom_recipes" TO "service_role";



GRANT ALL ON TABLE "public"."app_component_sales_last_3_months" TO "anon";
GRANT ALL ON TABLE "public"."app_component_sales_last_3_months" TO "authenticated";
GRANT ALL ON TABLE "public"."app_component_sales_last_3_months" TO "service_role";



GRANT ALL ON TABLE "public"."app_customers" TO "anon";
GRANT ALL ON TABLE "public"."app_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."app_customers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_customers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_customers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_customers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_inbound_shipment_items" TO "anon";
GRANT ALL ON TABLE "public"."app_inbound_shipment_items" TO "authenticated";
GRANT ALL ON TABLE "public"."app_inbound_shipment_items" TO "service_role";



GRANT ALL ON TABLE "public"."app_inbound_shipments" TO "anon";
GRANT ALL ON TABLE "public"."app_inbound_shipments" TO "authenticated";
GRANT ALL ON TABLE "public"."app_inbound_shipments" TO "service_role";



GRANT ALL ON TABLE "public"."app_inventory_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."app_inventory_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."app_inventory_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."app_inventory_counts" TO "anon";
GRANT ALL ON TABLE "public"."app_inventory_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."app_inventory_counts" TO "service_role";



GRANT ALL ON TABLE "public"."app_inventory_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."app_inventory_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."app_inventory_snapshots" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_order_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_order_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_order_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_order_item_attributes" TO "anon";
GRANT ALL ON TABLE "public"."app_order_item_attributes" TO "authenticated";
GRANT ALL ON TABLE "public"."app_order_item_attributes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_order_item_attributes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_order_item_attributes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_order_item_attributes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_products" TO "anon";
GRANT ALL ON TABLE "public"."app_products" TO "authenticated";
GRANT ALL ON TABLE "public"."app_products" TO "service_role";



GRANT ALL ON TABLE "public"."app_order_items_active_with_attributes_and_products_view" TO "anon";
GRANT ALL ON TABLE "public"."app_order_items_active_with_attributes_and_products_view" TO "authenticated";
GRANT ALL ON TABLE "public"."app_order_items_active_with_attributes_and_products_view" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_order_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_order_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_order_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."view_order_items_active_with_attributes_and_products_view" TO "anon";
GRANT ALL ON TABLE "public"."view_order_items_active_with_attributes_and_products_view" TO "authenticated";
GRANT ALL ON TABLE "public"."view_order_items_active_with_attributes_and_products_view" TO "service_role";



GRANT ALL ON TABLE "public"."app_orders_with_customers_view" TO "anon";
GRANT ALL ON TABLE "public"."app_orders_with_customers_view" TO "authenticated";
GRANT ALL ON TABLE "public"."app_orders_with_customers_view" TO "service_role";



GRANT ALL ON TABLE "public"."app_products_inventory_categories" TO "anon";
GRANT ALL ON TABLE "public"."app_products_inventory_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."app_products_inventory_categories" TO "service_role";



GRANT ALL ON TABLE "public"."app_purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."app_purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."app_purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."app_purchase_orders_positions_normal" TO "anon";
GRANT ALL ON TABLE "public"."app_purchase_orders_positions_normal" TO "authenticated";
GRANT ALL ON TABLE "public"."app_purchase_orders_positions_normal" TO "service_role";



GRANT ALL ON TABLE "public"."app_purchase_orders_positions_normal_view" TO "anon";
GRANT ALL ON TABLE "public"."app_purchase_orders_positions_normal_view" TO "authenticated";
GRANT ALL ON TABLE "public"."app_purchase_orders_positions_normal_view" TO "service_role";



GRANT ALL ON TABLE "public"."app_purchase_orders_positions_special" TO "anon";
GRANT ALL ON TABLE "public"."app_purchase_orders_positions_special" TO "authenticated";
GRANT ALL ON TABLE "public"."app_purchase_orders_positions_special" TO "service_role";



GRANT ALL ON TABLE "public"."app_purchase_orders_positions_special_view" TO "anon";
GRANT ALL ON TABLE "public"."app_purchase_orders_positions_special_view" TO "authenticated";
GRANT ALL ON TABLE "public"."app_purchase_orders_positions_special_view" TO "service_role";



GRANT ALL ON TABLE "public"."app_purchase_orders_view" TO "anon";
GRANT ALL ON TABLE "public"."app_purchase_orders_view" TO "authenticated";
GRANT ALL ON TABLE "public"."app_purchase_orders_view" TO "service_role";



GRANT ALL ON TABLE "public"."app_stock_levels" TO "anon";
GRANT ALL ON TABLE "public"."app_stock_levels" TO "authenticated";
GRANT ALL ON TABLE "public"."app_stock_levels" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_stock_levels_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_stock_levels_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_stock_levels_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_stock_locations" TO "anon";
GRANT ALL ON TABLE "public"."app_stock_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."app_stock_locations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_stock_locations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_stock_locations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_stock_locations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_stocks" TO "anon";
GRANT ALL ON TABLE "public"."app_stocks" TO "authenticated";
GRANT ALL ON TABLE "public"."app_stocks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_stocks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_stocks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_stocks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_supplier_contacts" TO "anon";
GRANT ALL ON TABLE "public"."app_supplier_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."app_supplier_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."app_suppliers" TO "anon";
GRANT ALL ON TABLE "public"."app_suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."app_suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bom_recipes_id_seq1" TO "anon";
GRANT ALL ON SEQUENCE "public"."bom_recipes_id_seq1" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bom_recipes_id_seq1" TO "service_role";



GRANT ALL ON TABLE "public"."export_current_purchase_prices" TO "anon";
GRANT ALL ON TABLE "public"."export_current_purchase_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."export_current_purchase_prices" TO "service_role";



GRANT ALL ON TABLE "public"."export_wareneingang_mtl" TO "anon";
GRANT ALL ON TABLE "public"."export_wareneingang_mtl" TO "authenticated";
GRANT ALL ON TABLE "public"."export_wareneingang_mtl" TO "service_role";



GRANT ALL ON TABLE "public"."integration_outbox" TO "anon";
GRANT ALL ON TABLE "public"."integration_outbox" TO "authenticated";
GRANT ALL ON TABLE "public"."integration_outbox" TO "service_role";



GRANT ALL ON SEQUENCE "public"."integration_outbox_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."integration_outbox_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."integration_outbox_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."inventory_adjustments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."inventory_adjustments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."inventory_adjustments_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."inventory_counts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."inventory_counts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."inventory_counts_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."inventory_sessions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."inventory_sessions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."inventory_sessions_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."inventory_snapshots_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."inventory_snapshots_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."inventory_snapshots_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ops_sync_cursor" TO "anon";
GRANT ALL ON TABLE "public"."ops_sync_cursor" TO "authenticated";
GRANT ALL ON TABLE "public"."ops_sync_cursor" TO "service_role";



GRANT ALL ON TABLE "public"."ops_sync_runs" TO "anon";
GRANT ALL ON TABLE "public"."ops_sync_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."ops_sync_runs" TO "service_role";



GRANT ALL ON TABLE "public"."ref_billbee_product_data_enrichment" TO "anon";
GRANT ALL ON TABLE "public"."ref_billbee_product_data_enrichment" TO "authenticated";
GRANT ALL ON TABLE "public"."ref_billbee_product_data_enrichment" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ref_billbee_product_data_enrichment_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ref_billbee_product_data_enrichment_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ref_billbee_product_data_enrichment_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ref_billbee_product_extension" TO "anon";
GRANT ALL ON TABLE "public"."ref_billbee_product_extension" TO "authenticated";
GRANT ALL ON TABLE "public"."ref_billbee_product_extension" TO "service_role";



GRANT ALL ON TABLE "public"."ref_billbee_products_mirror" TO "anon";
GRANT ALL ON TABLE "public"."ref_billbee_products_mirror" TO "authenticated";
GRANT ALL ON TABLE "public"."ref_billbee_products_mirror" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ref_billbee_products_mirror_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ref_billbee_products_mirror_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ref_billbee_products_mirror_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."rpt_app_products_profitability" TO "anon";
GRANT ALL ON TABLE "public"."rpt_app_products_profitability" TO "authenticated";
GRANT ALL ON TABLE "public"."rpt_app_products_profitability" TO "service_role";



GRANT ALL ON TABLE "public"."rpt_inbound_items_enriched" TO "anon";
GRANT ALL ON TABLE "public"."rpt_inbound_items_enriched" TO "authenticated";
GRANT ALL ON TABLE "public"."rpt_inbound_items_enriched" TO "service_role";



GRANT ALL ON TABLE "public"."rpt_inbound_items_monthly" TO "anon";
GRANT ALL ON TABLE "public"."rpt_inbound_items_monthly" TO "authenticated";
GRANT ALL ON TABLE "public"."rpt_inbound_items_monthly" TO "service_role";



GRANT ALL ON TABLE "public"."rpt_po_deliveries_by_month_and_category" TO "anon";
GRANT ALL ON TABLE "public"."rpt_po_deliveries_by_month_and_category" TO "authenticated";
GRANT ALL ON TABLE "public"."rpt_po_deliveries_by_month_and_category" TO "service_role";



GRANT ALL ON TABLE "public"."rpt_product_sales_with_bom" TO "anon";
GRANT ALL ON TABLE "public"."rpt_product_sales_with_bom" TO "authenticated";
GRANT ALL ON TABLE "public"."rpt_product_sales_with_bom" TO "service_role";



GRANT ALL ON TABLE "public"."stg_billbee_stock" TO "anon";
GRANT ALL ON TABLE "public"."stg_billbee_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."stg_billbee_stock" TO "service_role";



GRANT ALL ON TABLE "public"."stg_billbee_stock_committed" TO "anon";
GRANT ALL ON TABLE "public"."stg_billbee_stock_committed" TO "authenticated";
GRANT ALL ON TABLE "public"."stg_billbee_stock_committed" TO "service_role";



GRANT ALL ON TABLE "public"."rpt_products_inventory_purchasing" TO "anon";
GRANT ALL ON TABLE "public"."rpt_products_inventory_purchasing" TO "authenticated";
GRANT ALL ON TABLE "public"."rpt_products_inventory_purchasing" TO "service_role";



GRANT ALL ON TABLE "public"."rpt_products_inventory_grouped" TO "anon";
GRANT ALL ON TABLE "public"."rpt_products_inventory_grouped" TO "authenticated";
GRANT ALL ON TABLE "public"."rpt_products_inventory_grouped" TO "service_role";



GRANT ALL ON SEQUENCE "public"."seq_app_purchase_orders" TO "anon";
GRANT ALL ON SEQUENCE "public"."seq_app_purchase_orders" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."seq_app_purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."view_bom_materialcosts" TO "anon";
GRANT ALL ON TABLE "public"."view_bom_materialcosts" TO "authenticated";
GRANT ALL ON TABLE "public"."view_bom_materialcosts" TO "service_role";



GRANT ALL ON TABLE "public"."view_inventory_sessions_with_product_count" TO "anon";
GRANT ALL ON TABLE "public"."view_inventory_sessions_with_product_count" TO "authenticated";
GRANT ALL ON TABLE "public"."view_inventory_sessions_with_product_count" TO "service_role";



GRANT ALL ON TABLE "public"."view_inventory_stock_level_comparison" TO "anon";
GRANT ALL ON TABLE "public"."view_inventory_stock_level_comparison" TO "authenticated";
GRANT ALL ON TABLE "public"."view_inventory_stock_level_comparison" TO "service_role";



GRANT ALL ON TABLE "public"."view_orders" TO "anon";
GRANT ALL ON TABLE "public"."view_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."view_orders" TO "service_role";



GRANT ALL ON TABLE "public"."view_orders_monthly_revenue" TO "anon";
GRANT ALL ON TABLE "public"."view_orders_monthly_revenue" TO "authenticated";
GRANT ALL ON TABLE "public"."view_orders_monthly_revenue" TO "service_role";



GRANT ALL ON TABLE "public"."view_orders_open_backlog_monthly" TO "anon";
GRANT ALL ON TABLE "public"."view_orders_open_backlog_monthly" TO "authenticated";
GRANT ALL ON TABLE "public"."view_orders_open_backlog_monthly" TO "service_role";



GRANT ALL ON TABLE "public"."view_orders_open_delivery_backlog_monthly" TO "anon";
GRANT ALL ON TABLE "public"."view_orders_open_delivery_backlog_monthly" TO "authenticated";
GRANT ALL ON TABLE "public"."view_orders_open_delivery_backlog_monthly" TO "service_role";



GRANT ALL ON TABLE "public"."view_products" TO "anon";
GRANT ALL ON TABLE "public"."view_products" TO "authenticated";
GRANT ALL ON TABLE "public"."view_products" TO "service_role";



GRANT ALL ON TABLE "public"."view_products_antique" TO "anon";
GRANT ALL ON TABLE "public"."view_products_antique" TO "authenticated";
GRANT ALL ON TABLE "public"."view_products_antique" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























