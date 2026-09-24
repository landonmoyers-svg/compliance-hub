-- What role someone gets the first time they sign in.
--
-- Staff sign into the Hub with Microsoft, and a first sign-in creates a
-- profile with a default role. That default is 'staff', which can see almost
-- nothing — so without this, everyone would arrive with SharePoint access that
-- works and a Hub that offers them nothing, and somebody would fix it by hand
-- once per person.
--
-- The alternative was inferring the role from the employee record's job title.
-- That is rejected deliberately: a job title is a description, not a grant,
-- and one of these records said "Administrative" for someone who is an MA.
-- Access to patient identifiers should be something a person decided, not
-- something a string implied.
--
-- So this is an explicit, curated list. If an email is not on it, the person
-- still lands as 'staff' and an administrator promotes them — the safe way to
-- be wrong.

create table if not exists public.onboarding_roles (
  email text primary key,
  account_role text not null,
  note text,
  created_date timestamptz not null default now(),
  constraint onboarding_roles_role_valid check (account_role = any (array[
    'owner','admin','hr','clinical_leadership','manager','medical_staff','staff','contractor','read_only'
  ]))
);

comment on table public.onboarding_roles is
  'Email to intended Hub role, applied when a profile is first created. Curated by an administrator; absence means the default, not a guess.';

alter table public.onboarding_roles enable row level security;

drop policy if exists onboarding_roles_read on public.onboarding_roles;
create policy onboarding_roles_read on public.onboarding_roles
  for select using (is_privileged());

drop policy if exists onboarding_roles_write on public.onboarding_roles;
create policy onboarding_roles_write on public.onboarding_roles
  for all using (owner_or_admin()) with check (owner_or_admin());

-- RLS alone is not enough: a new table reaches nobody until it is granted.
grant select, insert, update, delete on public.onboarding_roles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare intended text;
begin
  select account_role into intended
  from public.onboarding_roles
  where lower(email) = lower(new.email);

  insert into public.profiles (user_id, full_name, email, account_role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(intended, 'staff')
  );
  return new;
end;
$function$;
