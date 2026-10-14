begin;
insert into auth.users(id) values ('d0310000-0000-4000-8000-000000000001'),('d0310000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','d0310000-0000-4000-8000-000000000001',true);
insert into public.profiles(id,allergies,consent_version) values ('d0310000-0000-4000-8000-000000000001',array['milk'],'2026-09-30');
insert into public.pantry_items(product,expires_on) values ('{"name":"RLS check"}'::jsonb,'2026-12-31');
select set_config('request.jwt.claim.sub','d0310000-0000-4000-8000-000000000002',true);
do $$ begin
if exists(select 1 from public.profiles) then raise exception 'Cross-user read allowed'; end if;
update public.profiles set allergies=array['soy'] where id='d0310000-0000-4000-8000-000000000001';
if found then raise exception 'Cross-user update allowed'; end if;
delete from public.profiles where id='d0310000-0000-4000-8000-000000000001';
if found then raise exception 'Cross-user delete allowed'; end if;
if exists(select 1 from public.pantry_items) then raise exception 'Cross-user pantry read allowed'; end if;
update public.pantry_items set status='consumed', closed_at=now();
if found then raise exception 'Cross-user pantry update allowed'; end if;
end $$;
insert into public.profiles(id,allergies,consent_version) values ('d0310000-0000-4000-8000-000000000002',array['soy'],'2026-09-30');
select public.delete_my_account();
reset role;
do $$ begin
if exists(select 1 from auth.users where id='d0310000-0000-4000-8000-000000000002') then raise exception 'Account deletion failed'; end if;
if not exists(select 1 from public.profiles where id='d0310000-0000-4000-8000-000000000001') then raise exception 'Other user profile deleted'; end if;
end $$;
rollback;
select 'PASS: owner isolation (profiles, pantry) and self-delete; synthetic fixtures rolled back' as result;