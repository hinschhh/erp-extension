create table public.integration_outbox (
  id bigserial not null,
  topic text not null,
  payload jsonb not null,
  status text not null default 'pending'::text,
  error text null,
  created_at timestamp with time zone not null default now(),
  available_at timestamp with time zone not null default now(),
  constraint integration_outbox_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists ix_integration_outbox_status on public.integration_outbox using btree (status, available_at) TABLESPACE pg_default;

create trigger trg_ai_notify_n8n
after INSERT on integration_outbox for EACH row
execute FUNCTION fn_notify_n8n_new_entry ();