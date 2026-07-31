# Furvise production threat model — Phase S1

## Assets and trust boundaries

Assets: Supabase identities/sessions; owner and pet profiles; care history/episodes/state/concerns; memories; conversations; Vet Briefs; recommendation context; AI credit ledger; provider/DB/service credentials; ingestion audit data; generated PDFs.

Trust boundaries: browser ↔ Next.js route handlers; browser ↔ Supabase Data/Auth APIs; Next.js ↔ Supabase under user JWT; operator scripts ↔ Supabase under server key; Next.js ↔ OpenAI; provider ingestion ↔ allowlisted external hosts; deployment control planes ↔ runtime secrets.

## Attackers and abuse cases

| Attacker | Abuse case | Existing control/evidence | Residual risk |
|---|---|---|---|
| anonymous internet user | call private AI/data/RPC endpoints | bearer required; `auth.getUser`; live anonymous repair denial | volumetric traffic before auth; S2 edge rate/WAF |
| authenticated malicious user | swap pet/conversation/memory/brief/suggestion IDs | explicit owner filters + RLS; live two-user negative reads and mutation denial | untested legacy table combinations; continuous DB tests |
| authenticated malicious user | supply another `user_id` to definer RPC | RPC compares to `auth.uid()`; live 42501 denial | future RPC regression |
| account attacker | reset/OAuth redirect/session theft | redirect constrained to local path; Supabase Auth; tokens not logged | Dashboard URL allowlist/MFA/identity-link settings unverified |
| cost abuser | large/repeated AI calls | monthly atomic credits, request idempotency, payload/output/time caps | no global daily spend kill switch or distributed concurrency limiter |
| storage attacker | enumerate/upload active content | zero buckets verified | future bucket configuration must add private policies/MIME limits |
| compromised operator/dependency | use service key or malicious package | service key isolated to scripts/server module; lockfile; audit performed | Next 16.2.9 advisories and supply-chain settings remain |

## Failure analysis

- Data exposure: primary failure modes are an owner filter omitted in a route, RLS/policy regression, or definer RPC trusting input identity. Defense is duplicated route + RLS checks and negative tests.
- Billing/provider abuse: credits are reserved atomically, released after provider failure, and completed once. Missing project-wide spend and concurrency controls can still permit aggregate loss.
- Account takeover: OAuth/password reset are delegated to Supabase; application rejects external `next` paths. Dashboard redirect, password, email, anonymous-login, and CAPTCHA configuration remains unverified.
- Privilege escalation: service repair functions have normal-role execute revoked; operator scripts use a server key. A client import of an admin module or future grant regression is the key risk.
- Storage abuse: no current Supabase storage. Browser-local pet photos create device privacy/persistence considerations but no cross-user server enumeration.
- Provider abuse/data exposure: prompts include private pet/context data. Keys are server-only; output/context limits exist. Production project separation, sharing settings, retention eligibility, budgets, and alerts are deployment controls.
- Operational failure: repair functions have linted type warnings; no repository backup/restore runbook, centralized monitoring, or advisor capture. These are S2 work.

## Security invariants

1. Canonical ownership is Supabase auth user UUID, never email or client-supplied user ID.
2. Service credentials never enter client components or `NEXT_PUBLIC_*` variables.
3. Every private relation has RLS and owner/pet relationship checks.
4. Service repair/diagnostic RPC execution is revoked from anon/authenticated.
5. AI writes use request IDs and atomic reserve/complete/release accounting.
6. Client errors never contain raw database/provider objects; logs never contain credentials or full private content.
7. Future upload buckets default private, reject SVG/HTML, and enforce owner paths, MIME and byte caps.
