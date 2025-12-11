create table public.app_inventory_adjustments (
  id bigserial not null,
  session_id bigint not null,
  fk_products bigint not null,
  fk_stocks bigint not null,
  delta numeric not null,
  status text not null default 'pending'::text,
  error_message text null,
  source_count_id bigint null,
  note text null,
  created_at timestamp with time zone not null default now(),
  constraint inventory_adjustments_pkey primary key (id),
  constraint inventory_adjustments_fk_products_fkey foreign KEY (fk_products) references app_products (id),
  constraint inventory_adjustments_fk_stocks_fkey foreign KEY (fk_stocks) references app_stocks (id),
  constraint inventory_adjustments_session_id_fkey foreign KEY (session_id) references app_inventory_sessions (id) on delete CASCADE,
  constraint inventory_adjustments_source_count_id_fkey foreign KEY (source_count_id) references app_inventory_counts (id),
  constraint inventory_adjustments_status_check check (
    (
      status = any (
        array[
          'pending'::text,
          'sent'::text,
          'failed'::text,
          'applied'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists inventory_adjustments_session_idx on public.app_inventory_adjustments using btree (session_id) TABLESPACE pg_default;

create index IF not exists inventory_adjustments_product_idx on public.app_inventory_adjustments using btree (fk_products) TABLESPACE pg_default;

create index IF not exists inventory_adjustments_stock_idx on public.app_inventory_adjustments using btree (fk_stocks) TABLESPACE pg_default;

create index IF not exists inventory_adjustments_status_idx on public.app_inventory_adjustments using btree (status) TABLESPACE pg_default;
