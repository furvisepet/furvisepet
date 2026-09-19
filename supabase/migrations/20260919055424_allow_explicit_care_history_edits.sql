alter table public.ask_action_capabilities
  drop constraint if exists ask_action_capabilities_policy_check;

alter table public.ask_action_capabilities
  add constraint ask_action_capabilities_policy_check check (
    mutation_class = 'mutation'
    and (
      (action_kind = 'pet.update_profile'
        and safety_class = 'LOW_RISK_REVERSIBLE' and confirmation_policy = 'explicit_intent' and authorization_scope = 'owned_pet')
      or (action_kind in ('memory.set_preference', 'memory.forget_preference')
        and safety_class = 'LOW_RISK_REVERSIBLE' and confirmation_policy = 'explicit_intent' and authorization_scope = 'owned_user')
      or (action_kind = 'care_history.add'
        and safety_class = 'LOW_RISK_REVERSIBLE' and confirmation_policy = 'explicit_intent' and authorization_scope = 'owned_pet')
      or (action_kind = 'care_history.edit'
        and safety_class = 'LOW_RISK_REVERSIBLE' and confirmation_policy = 'explicit_intent' and authorization_scope = 'owned_care_record')
      or (action_kind = 'care_history.remove'
        and safety_class = 'CONFIRMATION_REQUIRED' and confirmation_policy = 'always' and authorization_scope = 'owned_care_record')
      or (action_kind in ('care_state.resolve', 'care_state.reopen')
        and safety_class = 'LOW_RISK_REVERSIBLE' and confirmation_policy = 'explicit_intent' and authorization_scope = 'owned_concern')
      or (action_kind in ('pet.mark_deceased', 'pet.mark_active', 'pet.archive')
        and safety_class = 'CONFIRMATION_REQUIRED' and confirmation_policy = 'always' and authorization_scope = 'owned_pet')
      or (action_kind = 'pet.delete_permanently'
        and safety_class = 'DESTRUCTIVE' and confirmation_policy = 'always' and authorization_scope = 'owned_pet')
    )
  );
