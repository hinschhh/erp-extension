create table public.app_supplier_contacts (
  id uuid not null default gen_random_uuid (),
  contact_name text not null,
  role_title text null,
  email text null,
  phone text null,
  is_default boolean not null default false,
  notes text null,
  created_at timestamp with time zone not null default now(),
  fk_bb_supplier text null,
  constraint app_supplier_contacts_pkey primary key (id),
  constraint app_supplier_contacts_fk_bb_supplier_fkey foreign KEY (fk_bb_supplier) references app_suppliers (id) on update CASCADE on delete set null
) TABLESPACE pg_default;

create index IF not exists app_supplier_contacts_supplier_id_idx on public.app_supplier_contacts using btree (fk_bb_supplier) TABLESPACE pg_default;