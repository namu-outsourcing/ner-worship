create table if not exists public.team_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_team_notices_created_at
on public.team_notices (created_at desc);

create index if not exists idx_team_notices_created_by
on public.team_notices (created_by);

create or replace function public.set_team_notices_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_team_notices_updated_at on public.team_notices;
create trigger trg_team_notices_updated_at
before update on public.team_notices
for each row
execute function public.set_team_notices_updated_at();

alter table public.team_notices enable row level security;

drop policy if exists "team_notices_select_authenticated" on public.team_notices;
create policy "team_notices_select_authenticated"
on public.team_notices
for select
to authenticated
using (true);

drop policy if exists "team_notices_insert_admin" on public.team_notices;
create policy "team_notices_insert_admin"
on public.team_notices
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.role::text) in ('system_admin', 'division_leader')
  )
);

drop policy if exists "team_notices_update_admin" on public.team_notices;
create policy "team_notices_update_admin"
on public.team_notices
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.role::text) in ('system_admin', 'division_leader')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.role::text) in ('system_admin', 'division_leader')
  )
);

drop policy if exists "team_notices_delete_admin" on public.team_notices;
create policy "team_notices_delete_admin"
on public.team_notices
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.role::text) in ('system_admin', 'division_leader')
  )
);
