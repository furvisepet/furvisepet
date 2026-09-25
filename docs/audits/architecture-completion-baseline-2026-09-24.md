# Architecture completion baseline — 2026-09-24

Tested application commit: `addfa7cb2bab3196cd4fb27b1c1be960a0744a1f`.
Tracked tree was clean. The five pre-existing untracked public assets were excluded.
No application behavior, test expectations, model configuration, or production resources changed.

| Gate | Passed / total |
| --- | ---: |
| G1 | 94 / 94 |
| G2 | 89 / 89 |
| G3A | 89 / 89 |
| G3C | 74 / 74 |
| Legacy calculation retirement | 5 / 5 |
| Retrieval | 239 / 239 |
| Brain | 78 / 78 |
| Body | 188 / 188 |
| Core | 51 / 51 |
| Publication | 85 / 85 |
| Profile | 78 / 78 |
| Canonical mutations | 184 / 184 |
| Capability/security | 84 / 84 |
| Safety | 54 / 56 |
| Audit | 209 / 222 |

Safety and Audit retain exactly the established two and thirteen failure identities. There are no added or missing failures. Groups overlap; these counts are not a unique-test total.

All direct dependencies are installed at package-lock versions. Typecheck, a fresh webpack production build (43 static pages), clean-copy typecheck, and `git diff --check` passed. The build excluded environment files and credentials; the existing offline fetch guard blocked external fetches. Tests used the established direct-Node server-only resolver hook and offline fetch guard.

This establishes Phase 0 only. Database compatibility, real-app acceptance, remaining architecture work, and production readiness are separate gates. No provider calls or production deployment occurred.
