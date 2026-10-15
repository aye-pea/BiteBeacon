-- Six more app languages: Traditional Chinese, Haitian Creole, Russian, Korean, French and Hindi.
alter table public.profiles drop constraint if exists profile_language;
alter table public.profiles
  add constraint profile_language check (language is null or language in ('en','es','zh','zh-Hant','bn','vi','ht','ru','ko','fr','hi'));
