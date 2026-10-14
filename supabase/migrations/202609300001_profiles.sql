begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  allergies text[] not null default '{}',
  consent_version text not null check (consent_version = '2026-09-30'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supported_allergies check (
    allergies <@ array['milk','eggs','peanuts','tree-nuts','soy','wheat','fish','shellfish','sesame']::text[]
    and cardinality(allergies) between 1 and 9
    and array_position(allergies, null) is null
  )
);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select, delete on public.profiles to authenticated;
grant insert (id, allergies, consent_version), update (id, allergies, consent_version) on public.profiles to authenticated;

create policy "Owner reads profile" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "Owner creates profile" on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "Owner edits profile" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Owner deletes profile" on public.profiles for delete to authenticated
  using ((select auth.uid()) = id);

create function public.touch_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.touch_profile() from public;
create trigger profile_updated before update on public.profiles
  for each row execute function public.touch_profile();

-- No input user ID. Identity comes only from the validated caller JWT.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

comment on table public.profiles is 'Sensitive allergy selections; owner-only access; no barcode history stored.';
commit;
