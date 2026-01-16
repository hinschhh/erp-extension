create table public.app_complaints_stages (
  created_at timestamp with time zone not null default now(),
  id text not null,
  constraint app_complaints_stages_pkey primary key (id),
  constraint app_complaints_stages_state_key unique (id)
) TABLESPACE pg_default;