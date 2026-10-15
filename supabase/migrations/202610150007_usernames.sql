-- Sign up with a username instead of an email. Runs after every earlier migration.
-- Supabase Auth needs an email, so the app signs up "name@users.bitebeacon.org", an address that never receives mail
-- ("Confirm email" must be off in Supabase). Later, in Settings, a person can swap it for a real email used for
-- password resets. The username itself is kept here, so it keeps working for sign-in after that swap.
begin;

create table public.usernames (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);
alter table public.usernames enable row level security;
alter table public.usernames force row level security;
revoke all on public.usernames from public, anon, authenticated;
grant select on public.usernames to authenticated;
create policy "Owner reads username" on public.usernames for select to authenticated
  using ((select auth.uid()) = user_id);

-- Claims the username when a username account is created. A name already held by another account (even one that has
-- since switched to a real email) makes the sign-up fail, so nobody can take over someone else's username.
create function public.claim_username() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.email) like '%@users.bitebeacon.org' then
    insert into public.usernames(user_id, username) values (new.id, split_part(lower(new.email), '@', 1));
  end if;
  return new;
end;
$$;
revoke all on function public.claim_username() from public, anon, authenticated;
create trigger claim_username after insert on auth.users
  for each row execute function public.claim_username();

-- Failed username sign-ins, so guessing a password through the function below stops after 10 tries in 15 minutes.
create table public.username_sign_in_failures (
  username text not null,
  failed_at timestamptz not null default now()
);
create index username_sign_in_failures_recent on public.username_sign_in_failures (username, failed_at);
alter table public.username_sign_in_failures enable row level security;
alter table public.username_sign_in_failures force row level security;
revoke all on public.username_sign_in_failures from public, anon, authenticated;

-- Signing in by username: returns the account's current email only when the password is right, so the app can then
-- sign in normally. A wrong password or unknown name returns nothing, and nobody can look up someone else's email.
create function public.username_sign_in_email(p_username text, p_password text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  name text := lower(trim(coalesce(p_username, '')));
  found_email text;
  hash text;
begin
  if (select count(*) from public.username_sign_in_failures f
      where f.username = name and f.failed_at > now() - interval '15 minutes') >= 10 then
    return null;
  end if;
  select u.email, u.encrypted_password into found_email, hash
    from public.usernames n join auth.users u on u.id = n.user_id where n.username = name;
  if hash is not null and p_password is not null and hash = extensions.crypt(p_password, hash) then
    return found_email;
  end if;
  insert into public.username_sign_in_failures(username) values (left(name, 40));
  delete from public.username_sign_in_failures where failed_at < now() - interval '1 day';
  return null;
end;
$$;
revoke all on function public.username_sign_in_email(text, text) from public;
grant execute on function public.username_sign_in_email(text, text) to anon, authenticated;

comment on table public.usernames is 'Username for each username account; readable only by its owner.';
comment on table public.username_sign_in_failures is 'Recent failed username sign-ins, for rate limiting; kept one day.';
commit;
