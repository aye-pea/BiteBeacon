begin;

-- People the account holder shops for. The account holder's own allergies stay in public.profiles.
create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  allergies text[] not null,
  position smallint not null default 0 check (position between 0 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_supported_allergies check (
    allergies <@ array['milk','eggs','peanuts','tree-nuts','soy','wheat','fish','shellfish','sesame']::text[]
    and cardinality(allergies) between 1 and 9
    and array_position(allergies, null) is null
  ),
  -- Lets profiles reference a default member only within the same owner.
  constraint household_member_owner unique (id, owner_id)
);
create index household_members_owner on public.household_members (owner_id, position);

alter table public.household_members enable row level security;
alter table public.household_members force row level security;
revoke all on public.household_members from public, anon, authenticated;
grant select, delete on public.household_members to authenticated;
-- owner_id is never client-supplied; it comes from the caller JWT through the column default.
grant insert (name, allergies, position), update (name, allergies, position) on public.household_members to authenticated;

create policy "Owner reads members" on public.household_members for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Owner adds members" on public.household_members for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "Owner edits members" on public.household_members for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Owner removes members" on public.household_members for delete to authenticated
  using ((select auth.uid()) = owner_id);

create trigger household_member_updated before update on public.household_members
  for each row execute function public.touch_profile();

-- Eight members plus the account holder. Runs as the caller, so RLS limits the count to their own rows.
create function public.limit_household_members() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.household_members where owner_id = new.owner_id) >= 8 then
    raise exception 'household_limit: at most 8 household members';
  end if;
  return new;
end;
$$;
revoke all on function public.limit_household_members() from public;
create trigger household_member_limit before insert on public.household_members
  for each row execute function public.limit_household_members();

-- Display name and default result view. Neither member nor default may belong to another owner.
alter table public.profiles
  add column display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 40),
  add column default_everyone boolean not null default false,
  add column default_member_id uuid,
  add constraint default_member_owned foreign key (default_member_id, id)
    references public.household_members (id, owner_id) on delete set null (default_member_id);
grant insert (display_name, default_everyone, default_member_id), update (display_name, default_everyone, default_member_id) on public.profiles to authenticated;

comment on table public.household_members is 'Sensitive allergy selections for people in the owner''s household; owner-only access.';
commit;
