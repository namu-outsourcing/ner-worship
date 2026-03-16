create table if not exists public.service_resources (
  service_id uuid primary key references public.services(id) on delete cascade,
  setlist_urls text[] not null default '{}'::text[],
  meditation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_service_resources_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_service_resources_updated_at on public.service_resources;
create trigger trg_service_resources_updated_at
before update on public.service_resources
for each row
execute function public.set_service_resources_updated_at();

alter table public.service_resources enable row level security;

drop policy if exists "service_resources_select_authenticated" on public.service_resources;
create policy "service_resources_select_authenticated"
on public.service_resources
for select
to authenticated
using (true);

drop policy if exists "service_resources_modify_admin" on public.service_resources;
create policy "service_resources_modify_admin"
on public.service_resources
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('division_leader', 'team_leader', 'secretary')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('division_leader', 'team_leader', 'secretary')
  )
);
