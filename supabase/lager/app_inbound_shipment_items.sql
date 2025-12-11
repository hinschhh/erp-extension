create table public.app_inbound_shipment_items (
  id uuid not null default gen_random_uuid (),
  shipment_id uuid not null,
  po_item_normal_id uuid null,
  po_item_special_id uuid null,
  order_id uuid not null,
  quantity_delivered numeric(12, 3) not null,
  created_at timestamp with time zone not null default now(),
  item_status public.is_status null,
  constraint app_inbound_shipment_items_pkey primary key (id),
  constraint app_inbound_shipment_items_po_item_normal_id_fkey foreign KEY (po_item_normal_id) references app_purchase_orders_positions_normal (id) on delete RESTRICT,
  constraint app_inbound_shipment_items_order_id_fkey foreign KEY (order_id) references app_purchase_orders (id) on delete RESTRICT,
  constraint app_inbound_shipment_items_po_item_special_id_fkey foreign KEY (po_item_special_id) references app_purchase_orders_positions_special (id) on delete RESTRICT,
  constraint app_inbound_shipment_items_shipment_id_fkey foreign KEY (shipment_id) references app_inbound_shipments (id) on delete CASCADE,
  constraint chk_exactly_one_kind check (
    (
      (
        ((po_item_normal_id is not null))::integer + ((po_item_special_id is not null))::integer
      ) = 1
    )
  ),
  constraint app_inbound_shipment_items_quantity_delivered_check check ((quantity_delivered > (0)::numeric))
) TABLESPACE pg_default;

create index IF not exists ix_inbound_items_order on public.app_inbound_shipment_items using btree (order_id) TABLESPACE pg_default;

create index IF not exists ix_inbound_items_normal on public.app_inbound_shipment_items using btree (po_item_normal_id) TABLESPACE pg_default;

create index IF not exists ix_inbound_items_special on public.app_inbound_shipment_items using btree (po_item_special_id) TABLESPACE pg_default;

create unique INDEX IF not exists ux_inbound_item_per_po_item on public.app_inbound_shipment_items using btree (
  shipment_id,
  COALESCE(po_item_normal_id, po_item_special_id)
) TABLESPACE pg_default;

create trigger trg_aiud__audit_app_inbound_items
after INSERT
or DELETE
or
update on app_inbound_shipment_items for EACH row
execute FUNCTION trgfn_generic_audit_logs_row_insert_update_delete_log ();

create trigger trg_aiud__refresh_po_item_status
after INSERT
or DELETE
or
update on app_inbound_shipment_items for EACH row
execute FUNCTION trgfn_app_inbound_shipment_items_po_item_status_sync_from_poste ();

create trigger trg_bu__forbid_qty_after_posted BEFORE
update OF quantity_delivered,
po_item_normal_id,
po_item_special_id on app_inbound_shipment_items for EACH row
execute FUNCTION trgfn_app_inbound_shipment_items_fks_quantity_delivered_restric ();