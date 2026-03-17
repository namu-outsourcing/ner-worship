do $$
declare
  role_enum text;
  role_constraint record;
begin
  select format('%I.%I', t_ns.nspname, t.typname)
  into role_enum
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace c_ns on c_ns.oid = c.relnamespace
  join pg_type t on t.oid = a.atttypid
  join pg_namespace t_ns on t_ns.oid = t.typnamespace
  where c_ns.nspname = 'public'
    and c.relname = 'profiles'
    and a.attname = 'role'
    and t.typtype = 'e'
  limit 1;

  if role_enum is not null then
    execute format('alter type %s add value if not exists %L', role_enum, 'system_admin');
  end if;

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
  'service_admin',
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
      and (p.role::text) in ('system_admin', 'service_admin', 'division_leader')
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
      and (p.role::text) in ('system_admin', 'service_admin', 'division_leader')
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
      and (p.role::text) in ('system_admin', 'service_admin', 'division_leader')
  )
  or exists (
    select 1
    from public.assignments a
    where a.service_id = public.service_resources.service_id
      and a.profile_id = auth.uid()
      and a.role_name ilike '%인도%'
  )
);
