create table public.app_inventory_snapshots (
  id bigserial not null,
  session_id bigint not null,
  fk_products bigint not null,
  fk_stocks bigint not null,
  source_stock_level_id bigint null,
  bb_stock_current numeric not null,
  bb_unfullfilled_amount numeric null,
  snapshot_taken_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  constraint inventory_snapshots_pkey primary key (id),
  constraint inventory_snapshots_fk_products_fkey foreign KEY (fk_products) references app_products (id),
  constraint inventory_snapshots_fk_stocks_fkey foreign KEY (fk_stocks) references app_stocks (id),
  constraint inventory_snapshots_session_id_fkey foreign KEY (session_id) references app_inventory_sessions (id) on delete CASCADE,
  constraint inventory_snapshots_source_stock_level_id_fkey foreign KEY (source_stock_level_id) references app_stock_levels (id)
) TABLESPACE pg_default;

create unique INDEX IF not exists inventory_snapshots_session_product_stock_uidx on public.app_inventory_snapshots using btree (session_id, fk_products, fk_stocks) TABLESPACE pg_default;

create index IF not exists inventory_snapshots_session_idx on public.app_inventory_snapshots using btree (session_id) TABLESPACE pg_default;

create index IF not exists inventory_snapshots_product_idx on public.app_inventory_snapshots using btree (fk_products) TABLESPACE pg_default;

create index IF not exists inventory_snapshots_stock_idx on public.app_inventory_snapshots using btree (fk_stocks) TABLESPACE pg_default;
