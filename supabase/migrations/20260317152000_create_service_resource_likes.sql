create table if not exists public.service_resource_likes (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (service_id, profile_id)
);

create index if not exists idx_service_resource_likes_service
on public.service_resource_likes (service_id);

create index if not exists idx_service_resource_likes_profile
on public.service_resource_likes (profile_id);

alter table public.service_resource_likes enable row level security;

drop policy if exists "service_resource_likes_select_authenticated" on public.service_resource_likes;
create policy "service_resource_likes_select_authenticated"
on public.service_resource_likes
for select
to authenticated
using (true);

drop policy if exists "service_resource_likes_insert_own" on public.service_resource_likes;
create policy "service_resource_likes_insert_own"
on public.service_resource_likes
for insert
to authenticated
with check (profile_id = auth.uid());

drop policy if exists "service_resource_likes_delete_own" on public.service_resource_likes;
create policy "service_resource_likes_delete_own"
on public.service_resource_likes
for delete
to authenticated
using (profile_id = auth.uid());
