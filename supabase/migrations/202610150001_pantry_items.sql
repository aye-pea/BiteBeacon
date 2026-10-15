begin;

-- Products the owner chose to keep after a scan, with the expiry date they read off the package.
-- Used and thrown-out items stay as the owner's pantry history until they delete them or the account.
create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Snapshot of the looked-up product so results can be rechecked without a new lookup.
  product jsonb not null check (jsonb_typeof(product) = 'object' and octet_length(product::text) <= 20000),
  expires_on date check (expires_on is null or expires_on between date '2000-01-01' and date '2100-12-31'),
  status text not null default 'active' check (status in ('active', 'consumed', 'discarded')),
  added_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint pantry_closed_matches_status check ((status = 'active') = (closed_at is null))
);
create index pantry_items_owner on public.pantry_items (owner_id, status, expires_on);

alter table public.pantry_items enable row level security;
alter table public.pantry_items force row level security;
revoke all on public.pantry_items from public, anon, authenticated;
grant select, delete on public.pantry_items to authenticated;
-- owner_id is never client-supplied; it comes from the caller JWT through the column default.
grant insert (product, expires_on), update (expires_on, status, closed_at) on public.pantry_items to authenticated;

create policy "Owner reads pantry" on public.pantry_items for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Owner adds to pantry" on public.pantry_items for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "Owner edits pantry" on public.pantry_items for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Owner removes pantry items" on public.pantry_items for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- 300 rows per owner, history included. Runs as the caller, so RLS limits the count to their own rows.
create function public.limit_pantry_items() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.pantry_items where owner_id = new.owner_id) >= 300 then
    raise exception 'pantry_limit: at most 300 pantry items including history';
  end if;
  return new;
end;
$$;
revoke all on function public.limit_pantry_items() from public;
create trigger pantry_item_limit before insert on public.pantry_items
  for each row execute function public.limit_pantry_items();

comment on table public.pantry_items is 'Products the owner keeps, with expiry dates and used/thrown-out history; owner-only access.';
commit;
