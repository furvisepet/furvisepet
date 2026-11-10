# Conversation context coverage

Ask already bounded dialogue to twelve messages, 8,000 serialized characters and 2,000 characters per message. The per-message clipping was not reflected in dialogueCoverage.partial, and the published answer omitted a deterministic conversation-window disclosure. A single 2,500-character prior message reproduced partial=false after clipping.

The core now counts clipped messages that actually survive the bounded window, distinguishes known omissions from upstream uncertainty, and retains the server-computed coverage in its immutable reviewed result. Both model calls receive this coverage. Publication includes a visible Conversation context section and missingUsefulDetails before citation signing; the size fallback retains it. A complete standalone answer remains complete and does not become free merely because older context is absent.

Nine regressions cover clipped text, omitted whole messages, upstream uncertainty, complete/empty context, only-retained clipping counts, serialized limits, exact note bytes, owner/body-bound citation tampering and publication size fallback. The controlled initial run was 0/9; the final nine pass. The intermediate 75/76 combined run exposed an overly strict negative test assumption that an optional missingUsefulDetails array always exists; that assertion now accepts its absence. The intermediate failure log is preserved.

No provider schema, read tool, record authority, call cap, owner boundary, database migration or CRUD page changed. A model cannot supply or override this branded server metadata. Exact saved wording is copied unchanged. This is a generic context-budget correction, with no question-specific dispatch.

Paid model acceptance is separate: this continuation made zero paid Ask turns. The previous 16-turn budget remains closed. Local and GitHub release checks are recorded separately and must not be substituted from an older source.
