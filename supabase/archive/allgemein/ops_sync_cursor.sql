create table public.ops_sync_cursor (
  kind text not null,
  next_offset integer not null,
  updated_at timestamp with time zone not null default now(),
  constraint ops_sync_cursor_pkey primary key (kind),
  constraint ops_sync_cursor_kind_key unique (kind)
) TABLESPACE pg_default;