# External production operator checklist

- Supabase: Security/Performance Advisors; confirmation; CAPTCHA; Auth/email/refresh rates; SMTP; password/leak protection; exact redirects; sessions; backup/PITR and restore drill; unused providers and anonymous sign-in disabled; pool limits.
- Upstash: separate preview/production DB and tokens; region/latency; timeout/failure behavior; emergency switch; real multi-instance test; alerts.
- OpenAI: separate production project/key; sharing disabled; budget/alerts; model/pricing review; Furvise ceilings; emergency exercise; prelaunch rotation.
- Vercel: environment separation; supported Node runtime; protected variables/deployments; custom domain/HTTPS/cache checks; log/alert provider; cron jobs. WAF is external and not configured by S2H.
- GitHub: CI, Dependabot, secret scanning, dependency graph, protected branch, required checks, least privilege, no PR deployment secrets.
- Turnstile: exact production domain, test key removed, secret configured in Supabase, signup/recovery/resend and expiry/reuse verified.

Every item needs dated evidence and reviewer. Repository preparation is not proof that an external setting is active.
