-- Six more allergens: gluten, mollusks, mustard, celery, sulfites and lupin (15 in total).
begin;

alter table public.profiles drop constraint if exists supported_allergies;
alter table public.profiles add constraint supported_allergies check (
  allergies <@ array['milk','eggs','peanuts','tree-nuts','soy','wheat','fish','shellfish','sesame','gluten','mollusks','mustard','celery','sulfites','lupin']::text[]
  and cardinality(allergies) between 1 and 15
  and array_position(allergies, null) is null
);

alter table public.household_members drop constraint if exists member_supported_allergies;
alter table public.household_members add constraint member_supported_allergies check (
  allergies <@ array['milk','eggs','peanuts','tree-nuts','soy','wheat','fish','shellfish','sesame','gluten','mollusks','mustard','celery','sulfites','lupin']::text[]
  and cardinality(allergies) between 1 and 15
  and array_position(allergies, null) is null
);

commit;
