# Experimental typed stack transport — offline candidate

Status: not connected to Ask dispatch; no hosted acceptance or model-semantic-fidelity claim.

The provider sees a finite JSON Schema using the original compiled supporting-node union and a separate required request root. There is no recursive provider union, custom grammar, model-authored numeric edge, or complex JSON hidden in strings. Every child operand is an explicit {"take":true} marker. In canonical field and array order, the server consumes completed child trees from a stack and creates their numeric edges. No operation, subject, temporal meaning, default, or missing operand is inferred. The unchanged strict decoder validates the resulting graph, parent/child types, root, depth, canonical order and canonical contract. Binder remains a separate mandatory authority gate.

All valid canonical trees have this postorder representation. Every consumed tree is removed from the stack, so reuse and cycles cannot be constructed. Underflow or unused trees fail closed. A wrong but well-formed node ordering can still represent the wrong meaning; protocol parity is not proof of whole-task fidelity.

Options assessed:
- Fully embedded typed structs: natural parent/child typing, but previous mandatory requests exceeded the fixed 60,000-character cap. Not selected.
- Schema-derived custom grammar: good local parity and sizing, but two retained hosted requests failed before generation. Not selected.
- Typed flat construction sequence: retains every compiled variant and avoids numeric links/recursion; selected for offline investigation. Generation ordering and hosted compatibility remain unproven.
- Repeated-phrase compression: measured negative savings; rejected.
- Reversible policy-word dictionary: selected with exact byte-for-byte inverse checks. It preserves every policy clause, but its effect on model comprehension still needs a live evaluation.

The complete final serialized synthetic requests retain five pets and the full 1,200-character current turn across 0/2/8/39 prior-turn histories. Omissions are disclosed by the existing source-window machinery. The minimum measured headroom is 2,742 characters. Mandatory-source/pinned-context combinations outside this matrix must still pass unchanged admission; no safe fit must fail, never truncate the current turn or silently drop pinned authority.

Existing output cap 8192, policy ceiling 100000, input/accounting limits, public mutation flags, canonical codec, Binder, replay and credit code are unchanged. The new module accepts a fresh runtime deadline for each conversion. Tests cover structural negatives and no-hook bounds.

Required next gates: independent code review; provider acceptance under separately authorized capped testing; complete generated plans through decoder and Binder; diverse unseen obligation scoring; per-call usage and exactly-once app credit proof; isolated read-only preview with certified evidence. No production release before these gates.

This branch is a recovery/engineering backup. Its archived patch is against the recorded candidate base, not an instruction to apply it wholesale to main. Preserve current source and reconcile dependencies before integration.
