create table public.bom_recipes (
  id bigserial not null,
  billbee_bom_id bigint not null,
  billbee_component_id bigint not null,
  quantity numeric not null,
  updated_at timestamp with time zone not null default now(),
  constraint bom_recipes_pkey1 primary key (id),
  constraint bom_recipes_billbee_bom_id_billbee_component_id_key unique (billbee_bom_id, billbee_component_id),
  constraint bom_recipes_billbee_bom_id_fkey foreign KEY (billbee_bom_id) references app_products (id),
  constraint bom_recipes_billbee_component_id_fkey foreign KEY (billbee_component_id) references app_products (id),
  constraint bom_recipes_quantity_check check ((quantity > (0)::numeric))
) TABLESPACE pg_default;

create index IF not exists idx_bom_parent on public.bom_recipes using btree (billbee_bom_id) TABLESPACE pg_default;

create index IF not exists idx_bom_component on public.bom_recipes using btree (billbee_component_id) TABLESPACE pg_default;