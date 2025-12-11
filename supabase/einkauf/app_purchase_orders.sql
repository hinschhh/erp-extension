create table public.app_purchase_orders (
  id uuid not null default gen_random_uuid (),
  order_number text not null,
  status public.po_status not null default 'draft'::po_status,
  ordered_at date null,
  proforma_confirmed_at date null,
  dol_planned_at date null,
  dol_actual_at date null,
  invoice_number text null,
  invoice_date date null,
  shipping_cost_net numeric(12, 2) not null default 0,
  notes text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  separate_invoice_for_shipping_cost boolean not null default false,
  supplier text null,
  invoice_file_url text null,
  constraint app_purchase_orders_pkey primary key (id),
  constraint app_purchase_orders_order_number_key unique (order_number),
  constraint app_purchase_orders_supplier_fkey foreign KEY (supplier) references app_suppliers (id) on update CASCADE on delete RESTRICT
) TABLESPACE pg_default;

create index IF not exists idx_po_dates on public.app_purchase_orders using btree (ordered_at, dol_planned_at, invoice_date) TABLESPACE pg_default;

create index IF not exists app_purchase_orders_supplier_id_idx on public.app_purchase_orders using btree (supplier) TABLESPACE pg_default;

create index IF not exists idx_app_purchase_orders_supplier on public.app_purchase_orders using btree (supplier) TABLESPACE pg_default;

create index IF not exists idx_po_status on public.app_purchase_orders using btree (status) TABLESPACE pg_default;

create trigger trg_app_po_assign_order_number BEFORE INSERT on app_purchase_orders for EACH row
execute FUNCTION trgfn_app_purchase_orders_order_number_assign ();

create trigger trg_au__po_recalc_shipping
after
update OF shipping_cost_net on app_purchase_orders for EACH row when (
  old.shipping_cost_net is distinct from new.shipping_cost_net
)
execute FUNCTION trgfn_app_purchase_orders_shipping_cost_net_recalc_on_po_change ();

create trigger trg_bu__lock_sep_flag_after_cost BEFORE
update OF separate_invoice_for_shipping_cost on app_purchase_orders for EACH row
execute FUNCTION trgfn_app_purchase_orders_separate_invoice_for_shipping_cost_re ();

create trigger trg_po_recalc_shipping_on_status
after
update on app_purchase_orders for EACH row
execute FUNCTION trgfn_app_purchase_orders_status_recalc_shipping_on_partially_i ();