begin;

-- Lets the default result view be any combination of people, not only one person or everyone.
-- default_everyone still means everyone, including people added later. Otherwise the default is the
-- account holder (when default_include_me) plus each listed member. Null default_member_ids means the
-- row predates this column and the older single default_member_id applies.
alter table public.profiles
  add column default_include_me boolean not null default true,
  add column default_member_ids uuid[]
    constraint default_member_ids_shape check (default_member_ids is null or (cardinality(default_member_ids) <= 8 and array_position(default_member_ids, null) is null));
grant insert (default_include_me, default_member_ids), update (default_include_me, default_member_ids) on public.profiles to authenticated;

-- An array cannot carry a foreign key, so a trigger keeps every listed member owned by the profile owner.
create function public.check_default_members() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from unnest(new.default_member_ids) as listed(id)
             where not exists (select 1 from public.household_members m where m.id = listed.id and m.owner_id = new.id)) then
    raise exception 'default_members_owned: default people must be your own household members';
  end if;
  return new;
end;
$$;
revoke all on function public.check_default_members() from public;
create trigger profile_default_members before insert or update of default_member_ids on public.profiles
  for each row when (new.default_member_ids is not null) execute function public.check_default_members();

-- Removing a member drops them from the owner's default, as the single-member foreign key did.
create function public.forget_default_member() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.profiles set default_member_ids = array_remove(default_member_ids, old.id)
    where id = old.owner_id and old.id = any(default_member_ids);
  return old;
end;
$$;
revoke all on function public.forget_default_member() from public;
create trigger household_member_forget_default after delete on public.household_members
  for each row execute function public.forget_default_member();

commit;
