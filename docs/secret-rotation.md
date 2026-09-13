# Secret inventory and rotation

Never print values. Production and preview use separate credentials.

| Secret | Location/exposure | Rotation impact and procedure |
|---|---|---|
| Supabase publishable key | Vercel; browser-appropriate | replace project key/config, deploy, test Auth/RLS; revoke old after validation |
| Supabase secret/service role | Vercel/operator environment, server only | disable costly jobs, rotate in Dashboard, update server/scripts, test readiness/deletion, revoke old immediately if compromised |
| DB password/management token | operator secret store | rotate provider-side, update approved tooling, verify parity/backup; no application use unless configured |
| OpenAI key | Vercel server only | disable AI, create production replacement, deploy/test guard, revoke old, compare spend |
| Upstash URL/token | Vercel/operator environment | disable AI, rotate token, update all environments/scripts, verify rate/readiness/emergency state, revoke old |
| Rate/Auth/operations HMAC secrets | Vercel server only | rotate during low traffic with AI disabled; existing limiter correlations reset, so retain upstream hosted limits and watch abuse. Current code does not provide unsafe indefinite dual-key acceptance |
| Turnstile site/secret | public Vercel key / secret in Supabase Dashboard | create replacement widget, update both sides, test all Auth flows, remove prior widget |
| SMTP/OAuth/webhook | provider/Vercel/Dashboard server only | rotate at provider, update Dashboard, test neutral flows/callback signatures, revoke old |
| Vercel/GitHub tokens | provider-managed | rotate/revoke, inspect audit history, verify CI/deploy least privilege |

Indicators include repository/history disclosure, unexpected use, provider alerts, unexplained Auth/email activity, and unknown operator actions. Rollback means restoring the newly issued key/config—not reactivating a suspected compromised credential. HMAC dual-key overlap was deliberately not added to authentication decisions because accepting old keys extends compromise; scheduled rotation temporarily resets ephemeral buckets and relies on hosted limits during the bounded transition.
