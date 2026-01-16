create table public.ops_sync_runs (
  kind text not null,
  run_date date not null,
  status text not null,
  started_at timestamp with time zone not null default now(),
  finished_at timestamp with time zone null,
  constraint ops_sync_runs_pkey primary key (kind, run_date),
  constraint ops_sync_runs_status_check check (
    (
      status = any (array['running'::text, 'done'::text])
    )
  )
) TABLESPACE pg_default;

create index IF not exists ops_sync_runs_status_idx on public.ops_sync_runs using btree (kind, status, run_date) TABLESPACE pg_default;