create table public.app_inbound_shipments (
  id uuid not null default gen_random_uuid (),
  delivery_note_no text null,
  arrived_at timestamp with time zone not null default now(),
  note text null,
  created_by uuid not null default auth.uid (),
  created_at timestamp with time zone not null default now(),
  shipping_cost_separate numeric null,
  fk_bb_supplier text null,
  inbound_number text null,
  status public.is_status null,
  updated_at timestamp with time zone null default now(),
  constraint app_inbound_shipments_pkey primary key (id),
  constraint app_inbound_shipments_inbound_number_key unique (inbound_number),
  constraint app_inbound_shipments_fk_bb_supplier_fkey foreign KEY (fk_bb_supplier) references app_suppliers (id) on update CASCADE on delete set null
) TABLESPACE pg_default;

create index IF not exists app_inbound_shipments_supplier_id_idx on public.app_inbound_shipments using btree (fk_bb_supplier) TABLESPACE pg_default;

create trigger trg_ai__allocate_shipping_costs_from_is
after INSERT on app_inbound_shipments for EACH row when (new.shipping_cost_separate is not null)
execute FUNCTION trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc ();

create trigger trg_aiud__audit_app_inbound_shipments
after INSERT
or DELETE
or
update on app_inbound_shipments for EACH row
execute FUNCTION trgfn_generic_audit_logs_row_insert_update_delete_log ();

create trigger trg_au__allocate_shipping_costs_from_is
after
update OF shipping_cost_separate on app_inbound_shipments for EACH row when (
  old.shipping_cost_separate is distinct from new.shipping_cost_separate
)
execute FUNCTION trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc ();

create trigger trg_au__sync_is_status_to_items
after
update OF status on app_inbound_shipments for EACH row
execute FUNCTION trgfn_app_inbound_shipments_status_sync_to_items ();

create trigger trg_bi__assign_inbound_number BEFORE INSERT on app_inbound_shipments for EACH row
execute FUNCTION trgfn_app_inbound_shipments_inbound_number_assign ();