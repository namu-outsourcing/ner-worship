create table if not exists public.availability_votes (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  availability text not null check (availability in ('available', 'maybe', 'unavailable')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, team_id, profile_id)
);

create index if not exists idx_availability_votes_service_team
on public.availability_votes (service_id, team_id);

create index if not exists idx_availability_votes_profile
on public.availability_votes (profile_id);

create or replace function public.set_availability_votes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_availability_votes_updated_at on public.availability_votes;
create trigger trg_availability_votes_updated_at
before update on public.availability_votes
for each row
execute function public.set_availability_votes_updated_at();

alter table public.availability_votes enable row level security;

drop policy if exists "availability_votes_select_scope" on public.availability_votes;
create policy "availability_votes_select_scope"
on public.availability_votes
for select
to authenticated
using (
  profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.role::text) in ('system_admin', 'service_admin', 'division_leader')
  )
  or (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (p.role::text) in ('team_leader', 'secretary')
    )
    and exists (
      select 1
      from public.team_members tm
      where tm.profile_id = auth.uid()
        and tm.team_id = public.availability_votes.team_id
    )
  )
);

drop policy if exists "availability_votes_insert_own" on public.availability_votes;
create policy "availability_votes_insert_own"
on public.availability_votes
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and exists (
    select 1
    from public.team_members tm
    where tm.profile_id = auth.uid()
      and tm.team_id = public.availability_votes.team_id
  )
);

drop policy if exists "availability_votes_update_own" on public.availability_votes;
create policy "availability_votes_update_own"
on public.availability_votes
for update
to authenticated
using (
  profile_id = auth.uid()
  and exists (
    select 1
    from public.team_members tm
    where tm.profile_id = auth.uid()
      and tm.team_id = public.availability_votes.team_id
  )
)
with check (
  profile_id = auth.uid()
  and exists (
    select 1
    from public.team_members tm
    where tm.profile_id = auth.uid()
      and tm.team_id = public.availability_votes.team_id
  )
);

drop policy if exists "availability_votes_delete_own" on public.availability_votes;
create policy "availability_votes_delete_own"
on public.availability_votes
for delete
to authenticated
using (
  profile_id = auth.uid()
  and exists (
    select 1
    from public.team_members tm
    where tm.profile_id = auth.uid()
      and tm.team_id = public.availability_votes.team_id
  )
);
