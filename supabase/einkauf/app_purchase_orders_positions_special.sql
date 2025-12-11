create table public.app_purchase_orders_positions_special (
  id uuid not null default gen_random_uuid (),
  order_id uuid not null,
  billbee_product_id bigint not null,
  base_model_billbee_product_id bigint null,
  supplier_sku text null,
  details_override text null,
  order_confirmation_ref text null,
  external_file_url text null,
  qty_ordered numeric(12, 3) not null default 1,
  unit_price_net numeric(12, 2) not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  internal_notes text null,
  proforma_confirmed_at date null,
  sketch_confirmed_at date null,
  dol_planned_at date null,
  dol_actual_at date null,
  goods_received_at date null,
  po_item_status public.po_item_status null default 'draft'::po_item_status,
  sketch_needed boolean null default true,
  shipping_costs_proportional numeric(12, 2) not null default 0,
  fk_app_order_items_id bigint null,
  fk_app_orders_id bigint null,
  constraint app_purchase_orders_positions_special_pkey primary key (id),
  constraint app_purchase_orders_positions_base_model_billbee_product_i_fkey foreign KEY (base_model_billbee_product_id) references app_products (id),
  constraint app_purchase_orders_positions_specia_fk_app_order_items_id_fkey foreign KEY (fk_app_order_items_id) references app_order_items (id) on update RESTRICT on delete RESTRICT,
  constraint app_purchase_orders_positions_special_billbee_product_id_fkey foreign KEY (billbee_product_id) references app_products (id),
  constraint app_purchase_orders_positions_special_fk_app_orders_id_fkey foreign KEY (fk_app_orders_id) references app_orders (id) on update RESTRICT on delete RESTRICT,
  constraint app_purchase_orders_positions_special_order_id_fkey foreign KEY (order_id) references app_purchase_orders (id) on delete CASCADE
) TABLESPACE pg_default;

create trigger trg_po_item_auto_advance_special
after
update OF po_item_status on app_purchase_orders_positions_special for EACH row
execute FUNCTION trgfn_app_purchase_orders_positions_special_po_item_status_auto ();

create trigger trg_po_item_enforce_status_special BEFORE
update OF po_item_status on app_purchase_orders_positions_special for EACH row
execute FUNCTION trgfn_app_purchase_orders_positions_po_item_status_restrict_tra ();

create trigger trg_update_po_status_special
after INSERT
or DELETE
or
update on app_purchase_orders_positions_special for EACH row
execute FUNCTION trgfn_app_purchase_orders_positions_status_trigger_recalc_po_st ();