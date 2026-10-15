-- Shows each username as the account's Display name in the Supabase dashboard (Authentication › Users).
-- The dashboard reads display_name from the account's user metadata; the app does not use it.
begin;

create function public.username_display_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.email) like '%@users.bitebeacon.org' then
    new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('display_name', split_part(lower(new.email), '@', 1));
  end if;
  return new;
end;
$$;
revoke all on function public.username_display_name() from public, anon, authenticated;
create trigger username_display_name before insert on auth.users
  for each row execute function public.username_display_name();

-- Existing accounts, including ones that have since switched to a real email.
update auth.users u set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('display_name', n.username)
  from public.usernames n
  where n.user_id = u.id and coalesce(u.raw_user_meta_data->>'display_name', '') = '';

commit;
