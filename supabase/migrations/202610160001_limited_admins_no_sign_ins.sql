-- Limited admins no longer get the recent sign-ins list (usernames and emails of other accounts).
-- Full admins are unchanged. Runs after 202610150009_admin_levels.sql.
begin;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if not public.is_admin() then raise exception 'admin_only: not an admin account'; end if;
  select jsonb_build_object(
    'generated_at', now(),
    'scans', (select total from public.scan_total where id),
    'accounts', (select count(*) from auth.users),
    'profiles', (select count(*) from public.profiles),
    'signups_7d', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'signups_30d', (select count(*) from auth.users where created_at >= now() - interval '30 days'),
    'active_1d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '1 day'),
    'active_7d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '7 days'),
    'active_30d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '30 days'),
    'signups_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'count', (
        select count(*) from auth.users u where u.created_at >= d and u.created_at < d + interval '1 day')) order by d), '[]'::jsonb)
      from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') as d),
    'recent_sign_ins', (select coalesce(jsonb_agg(r order by r.last_sign_in_at desc nulls last), '[]'::jsonb) from (
        select email, created_at, last_sign_in_at from auth.users order by last_sign_in_at desc nulls last limit 50) r),
    -- Account holders and household members together: how many people track each allergen.
    'allergens', (select coalesce(jsonb_object_agg(allergen, people), '{}'::jsonb) from (
        select allergen, count(*) as people from (
          select unnest(allergies) as allergen from public.profiles
          union all select unnest(allergies) from public.household_members) a group by allergen) c),
    'members', (select count(*) from public.household_members),
    -- Household size counts the account holder plus their members.
    'household_sizes', (select coalesce(jsonb_object_agg(size, accounts), '{}'::jsonb) from (
        select size, count(*) as accounts from (
          select 1 + (select count(*) from public.household_members m where m.owner_id = p.id) as size from public.profiles p) s
        group by size) h),
    'languages', (select coalesce(jsonb_object_agg(lang, accounts), '{}'::jsonb) from (
        select coalesce(language, 'device') as lang, count(*) as accounts from public.profiles group by 1) l),
    'pantry', (select jsonb_build_object(
        'items', count(*),
        'active', count(*) filter (where status = 'active'),
        'with_expiry', count(*) filter (where expires_on is not null),
        'accounts', count(distinct owner_id)) from public.pantry_items)
  ) into result;
  -- Limited admins see the scan total, accounts, activity and sign-ups only: no sign-in list (emails/usernames).
  if not exists (select 1 from public.admins where user_id = auth.uid() and full_access) then
    result := result - 'profiles' - 'members' - 'allergens' - 'household_sizes' - 'languages' - 'pantry' - 'recent_sign_ins';
  end if;
  return result || jsonb_build_object('full', exists (select 1 from public.admins where user_id = auth.uid() and full_access));
end;
$$;
revoke all on function public.admin_stats() from public;
grant execute on function public.admin_stats() to authenticated;

comment on column public.admins.full_access is 'True: whole dashboard. False: scans, accounts, activity and sign-ups only.';
commit;
