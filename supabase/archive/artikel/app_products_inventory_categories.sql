create table public.app_products_inventory_categories (
  created_at timestamp with time zone not null default now(),
  inventory_category text not null,
  constraint app_products_inventory_categories_pkey primary key (inventory_category)
) TABLESPACE pg_default;