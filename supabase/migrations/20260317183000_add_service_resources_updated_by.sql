alter table public.service_resources
add column if not exists updated_by uuid references public.profiles(id) on delete set null;

create or replace function public.set_service_resources_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if auth.uid() is not null then
    new.updated_by = auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_service_resources_insert_audit on public.service_resources;
create trigger trg_service_resources_insert_audit
before insert on public.service_resources
for each row
execute function public.set_service_resources_updated_at();
