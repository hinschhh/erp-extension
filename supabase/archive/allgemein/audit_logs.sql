create table public.audit_logs (
  id bigserial not null,
  user_id uuid not null,
  action text not null,
  entity_name text not null,
  entity_id text not null,
  old_values jsonb null,
  new_values jsonb null,
  created_at timestamp with time zone not null default now(),
  batch_id uuid null,
  constraint audit_logs_pkey primary key (id),
  constraint audit_logs_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;

create index IF not exists ix_audit_logs_batch on public.audit_logs using btree (batch_id) TABLESPACE pg_default;

create index IF not exists ix_audit_logs_entity on public.audit_logs using btree (entity_name, entity_id) TABLESPACE pg_default;

create index IF not exists ix_audit_logs_createdat on public.audit_logs using btree (created_at desc) TABLESPACE pg_default;