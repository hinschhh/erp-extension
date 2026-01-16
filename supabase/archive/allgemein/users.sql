create table public.users (
  id uuid not null,
  updated_at timestamp with time zone null,
  username text null,
  full_name text null,
  avatar_url text null,
  constraint users_pkey primary key (id),
  constraint users_username_key unique (username),
  constraint users_id_fkey foreign KEY (id) references auth.users (id)
) TABLESPACE pg_default;