-- Anonymous scan total and an admin-only statistics dashboard. Runs after every earlier migration.
begin;

-- One row: how many barcode lookups have finished across the whole app. Never which barcode, product or person.
create table public.scan_total (
  id boolean primary key default true check (id),
  total bigint not null default 0 check (total >= 0),
  updated_at timestamptz not null default now()
);
insert into public.scan_total default values;
alter table public.scan_total enable row level security;
alter table public.scan_total force row level security;
revoke all on public.scan_total from public, anon, authenticated;

-- Anyone using the app, signed in or in the demo, adds one per lookup. No arguments, so nothing else can be sent.
create function public.record_scan() returns void
language sql security definer set search_path = '' as $$
  update public.scan_total set total = total + 1, updated_at = now() where id;
$$;
revoke all on function public.record_scan() from public;
grant execute on function public.record_scan() to anon, authenticated;

-- Admins are added by hand in the Supabase dashboard (Table Editor → admins → Insert row → your user id).
-- No app role can read or change this table, so nobody can make themselves an admin from the app.
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;
alter table public.admins force row level security;
revoke all on public.admins from public, anon, authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Totals across every account, for admins only. Reads past row-level security, so it checks the caller first
-- and returns counts, never allergy lists tied to a person. Recent sign-ins show email and dates only.
create function public.admin_stats() returns jsonb
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
  return result;
end;
$$;
revoke all on function public.admin_stats() from public;
grant execute on function public.admin_stats() to authenticated;

comment on table public.scan_total is 'Anonymous running count of barcode lookups; no barcode, product or user is stored.';
comment on table public.admins is 'Accounts that can open the in-app statistics dashboard; edit only from the Supabase dashboard.';
commit;
