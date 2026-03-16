drop policy if exists "service_resources_modify_admin" on public.service_resources;
drop policy if exists "service_resources_modify_editor" on public.service_resources;

create policy "service_resources_modify_editor"
on public.service_resources
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'division_leader'
  )
  or exists (
    select 1
    from public.assignments a
    where a.service_id = public.service_resources.service_id
      and a.profile_id = auth.uid()
      and a.role_name ilike '%인도%'
  )
);

create policy "service_resources_modify_editor"
on public.service_resources
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'division_leader'
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
      and p.role = 'division_leader'
  )
  or exists (
    select 1
    from public.assignments a
    where a.service_id = public.service_resources.service_id
      and a.profile_id = auth.uid()
      and a.role_name ilike '%인도%'
  )
);
