begin;

-- App language the person picked in Settings. Null means follow the device language.
alter table public.profiles
  add column language text
  constraint profile_language check (language is null or language in ('en','es','zh','bn','vi'));
grant insert (language), update (language) on public.profiles to authenticated;

commit;
