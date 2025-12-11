create table public.app_suppliers (
  id text not null,
  short_code text null,
  email text null,
  phone text null,
  website text null,
  default_currency text not null default 'EUR'::text,
  payment_terms_days integer not null default 0,
  default_incoterm text null,
  default_leadtime_days integer not null default 0,
  vat_number text null,
  tax_country text null,
  address_line1 text null,
  address_line2 text null,
  postal_code text null,
  city text null,
  state_region text null,
  country text null,
  notes text null,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  default_order_channel public.order_channel null,
  default_payment_method text null,
  separate_invoice_for_shipping_cost boolean null,
  constraint app_suppliers_pkey primary key (id),
  constraint app_suppliers_name_key unique (id),
  constraint app_suppliers_name_key1 unique (id),
  constraint app_suppliers_name_key2 unique (id),
  constraint app_suppliers_short_code_key unique (short_code)
) TABLESPACE pg_default;

create index IF not exists idx_suppliers_active on public.app_suppliers using btree (active) TABLESPACE pg_default;

create index IF not exists idx_suppliers_name on public.app_suppliers using gin (
  to_tsvector('simple'::regconfig, COALESCE(id, ''::text))
) TABLESPACE pg_default;