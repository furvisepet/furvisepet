# Ask Furvise conversation intelligence audit

## Findings before this pass

- The answer route received the previous structured answer but not the current thread. Follow-up pronouns, user corrections, unresolved questions, and prior recommendations were therefore not dependable inputs.
- Every request loaded broad profile, care-history, memory, and product-feedback collections. The grounded-answer payload included most of them even when they were unrelated to the question.
- Several deterministic answers described record lookup instead of answering: counts of saved updates, "saved context" headings, broad missing-profile lists, and system-oriented instructions for vet preparation.
- Missing details were added to the answer contract even though the primary workspace already presents them once in pet context.
- Clarification was an accidental outcome of no-record language rather than an explicit decision. It could not reliably distinguish a resolvable follow-up from a genuinely ambiguous reference.
- Owner observations and profile facts were flattened into similar-looking bullets. This made an observation such as itching after food appear closer to a confirmed condition than intended.
- Save behavior created a general answer snapshot. It did not identify a bounded, attributed memory candidate or suppress a duplicate suggestion before presenting the action.
- Suggested questions were generic by answer type and did not account for the current concern, clarification need, or urgency.
- The deterministic urgent gate was sound, but ordinary answer generation and usage charging happened before the public response was completely validated.
- Analytics used safe enumerated metadata, but event names did not cover thread lifecycle, clarification, tracking, memory suggestions, or answer delivery failure.

## Decisions in this pass

- `buildConversationDecision` is internal and deterministic. It classifies practical intent, resolves recent references, identifies corrections, selects context, decides whether one clarification is necessary, and proposes bounded tracking and memory candidates.
- The browser receives only validated presentation fields. The decision plan, prompt, and classification details are neither returned nor persisted.
- The server loads at most the recent messages from the requested conversation after matching conversation, pet, and authenticated owner. A missing conversation ID means a clean thread with no temporary assumptions.
- Profile facts, care entries, saved details, and product feedback are filtered by intent and question terms before grounded generation. Human context labels describe only sources actually selected.
- Owner observations remain attributed as reports. A memory candidate always requires confirmation and is suppressed when it duplicates an existing saved detail.
- Urgent suppression remains ahead of continuity and grounded generation. A language model cannot replace or weaken that result.
- Usage increments once, after a complete public answer passes validation. Reopening, viewing, copying, and failed answer delivery do not increment usage.
- Analytics accept enumerated interaction metadata only. Raw questions, answers, symptoms, products, notes, and memory statements are not part of the analytics property type.

## Persistence

No migration is required. The existing owner-scoped conversation and message tables already store the active pet, concise title, dates, visible message content, and validated public response JSON. They do not store prompts, hidden plans, or chain-of-thought.
