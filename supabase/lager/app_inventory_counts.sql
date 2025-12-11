create table public.app_inventory_counts (
  id bigserial not null,
  session_id bigint not null,
  fk_products bigint not null,
  fk_stocks bigint not null,
  region text null,
  qty_sellable numeric not null default 0,
  qty_unsellable numeric not null default 0,
  counted_by uuid null,
  note text null,
  created_at timestamp with time zone not null default now(),
  constraint inventory_counts_pkey primary key (id),
  constraint inventory_counts_counted_by_fkey foreign KEY (counted_by) references auth.users (id),
  constraint inventory_counts_fk_products_fkey foreign KEY (fk_products) references app_products (id),
  constraint inventory_counts_fk_stocks_fkey foreign KEY (fk_stocks) references app_stocks (id),
  constraint inventory_counts_session_id_fkey foreign KEY (session_id) references app_inventory_sessions (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists inventory_counts_session_idx on public.app_inventory_counts using btree (session_id) TABLESPACE pg_default;

create index IF not exists inventory_counts_product_idx on public.app_inventory_counts using btree (fk_products) TABLESPACE pg_default;

create index IF not exists inventory_counts_stock_idx on public.app_inventory_counts using btree (fk_stocks) TABLESPACE pg_default;
