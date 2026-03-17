alter table public.service_resources
add column if not exists setlist_titles text[] not null default '{}'::text[];

