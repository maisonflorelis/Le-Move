-- Le Move — accès / plans / admin
-- À coller dans Supabase > SQL Editor puis Run

alter table public."Profiles"
  add column if not exists "Plan" text default 'essentiel';

alter table public."Profiles"
  add column if not exists is_admin boolean default false;

update public."Profiles"
set "Plan" = lower(coalesce(nullif("Plan", ''), 'essentiel'))
where "Plan" is null
   or "Plan" = ''
   or "Plan" <> lower("Plan");

update public."Profiles"
set is_admin = coalesce(is_admin, false)
where is_admin is null;

alter table public."Profiles"
  add constraint profiles_plan_check
  check ("Plan" in ('essentiel', 'complet', 'premium'))
  not valid;

alter table public."Profiles" validate constraint profiles_plan_check;

-- Ton compte admin
update public."Profiles" p
set "Plan" = 'premium',
    is_admin = true
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('sheryl.mercier@gmail.com');

-- Fonction sûre pour lire son accès courant depuis le front
create or replace function public.get_my_access()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plan',
      case
        when coalesce(p.is_admin, false) then 'admin'
        else lower(coalesce(p."Plan", 'essentiel'))
      end,
    'is_admin', coalesce(p.is_admin, false)
  )
  from public."Profiles" p
  where p.id = auth.uid()
  limit 1;
$$;

revoke all on function public.get_my_access() from public;
grant execute on function public.get_my_access() to authenticated;

alter table public."Profiles" enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Profiles'
      and policyname = 'profiles_select_own'
  ) then
    create policy profiles_select_own
    on public."Profiles"
    for select
    to authenticated
    using (id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Profiles'
      and policyname = 'profiles_update_own'
  ) then
    create policy profiles_update_own
    on public."Profiles"
    for update
    to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'Profiles'
      and policyname = 'profiles_insert_own'
  ) then
    create policy profiles_insert_own
    on public."Profiles"
    for insert
    to authenticated
    with check (id = auth.uid());
  end if;
end $$;
