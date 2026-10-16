-- Lets an account holder with no allergies of their own keep a profile row, so they can set up and check for
-- family members. Household members still need at least one allergy each.
begin;

alter table public.profiles drop constraint if exists supported_allergies;
alter table public.profiles add constraint supported_allergies check (
  allergies <@ array['milk','eggs','peanuts','tree-nuts','soy','wheat','fish','shellfish','sesame','gluten','mollusks','mustard','celery','sulfites','lupin']::text[]
  and cardinality(allergies) between 0 and 15
  and array_position(allergies, null) is null
);

commit;
