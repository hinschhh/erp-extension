create table public.app_inventory_sessions (
  id bigserial not null,
  name text not null,
  note text null,
  status text not null default 'draft'::text,
  created_at timestamp with time zone not null default now(),
  counting_started_at timestamp with time zone null,
  snapshot_taken_at timestamp with time zone null,
  closed_at timestamp with time zone null,
  constraint inventory_sessions_pkey primary key (id),
  constraint inventory_sessions_status_check check (
    (
      status = any (
        array['draft'::text, 'counting'::text, 'closed'::text]
      )
    )
  )
) TABLESPACE pg_default;