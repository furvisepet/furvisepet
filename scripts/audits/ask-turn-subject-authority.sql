-- Pure authority predicate checks; no patient or conversation data is written.
do $$
declare
  selected uuid := '00000000-0000-4000-8000-000000000001';
  named uuid := '00000000-0000-4000-8000-000000000002';
  authority jsonb;
begin
  authority := jsonb_build_object('semanticTrace',jsonb_build_object('subjectIntegrity',
    jsonb_build_object('agrees',true,'authoritativePetIds',jsonb_build_array(named::text))));
  assert private.ask_action_pet_matches_turn(selected,authority,named), 'named subject must be usable';
  assert not private.ask_action_pet_matches_turn(selected,authority,selected), 'selected pet must not override resolved subject';
  assert private.ask_action_pet_matches_turn(selected,null,selected), 'legacy selected subject remains valid';
  assert not private.ask_action_pet_matches_turn(selected,null,named), 'missing authority cannot authorize another pet';
  assert not private.ask_action_pet_matches_turn(selected,jsonb_set(authority,'{semanticTrace,subjectIntegrity,agrees}','false'),named), 'disagreement must fail';
  assert not private.ask_action_pet_matches_turn(selected,jsonb_set(authority,'{semanticTrace,subjectIntegrity,authoritativePetIds}',jsonb_build_array(selected::text,named::text)),named), 'ambiguous scope must fail';
  assert not private.ask_action_pet_matches_turn(selected,jsonb_set(authority,'{semanticTrace,subjectIntegrity,authoritativePetIds}','"malformed"'),named), 'malformed scope must fail';
end;
$$;
