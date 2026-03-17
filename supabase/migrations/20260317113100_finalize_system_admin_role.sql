do $$
declare
  role_constraint record;
begin
  update public.profiles
  set role = 'system_admin'
  where role::text = 'service_admin';

  for role_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', role_constraint.conname);
  end loop;
end $$;

alter table public.profiles
add constraint profiles_role_check
check ((role::text) in (
  'system_admin',
  'division_leader',
  'team_leader',
  'secretary',
  'worship_leader',
  'member'
));

drop policy if exists "service_resources_modify_editor" on public.service_resources;
drop policy if exists "service_resources_modify_editor_insert" on public.service_resources;
drop policy if exists "service_resources_modify_editor_update" on public.service_resources;

create policy "service_resources_modify_editor_insert"
on public.service_resources
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.role::text) in ('system_admin', 'division_leader')
  )
  or exists (
    select 1
    from public.assignments a
    where a.service_id = public.service_resources.service_id
      and a.profile_id = auth.uid()
      and a.role_name ilike '%인도%'
  )
);

create policy "service_resources_modify_editor_update"
on public.service_resources
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.role::text) in ('system_admin', 'division_leader')
  )
  or exists (
    select 1
    from public.assignments a
    where a.service_id = public.service_resources.service_id
      and a.profile_id = auth.uid()
      and a.role_name ilike '%인도%'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.role::text) in ('system_admin', 'division_leader')
  )
  or exists (
    select 1
    from public.assignments a
    where a.service_id = public.service_resources.service_id
      and a.profile_id = auth.uid()
      and a.role_name ilike '%인도%'
  )
);
