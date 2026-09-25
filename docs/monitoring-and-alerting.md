# Monitoring and alerting specification

The event adapter currently writes structured, redacted local logs. No notification provider or alert is active.

| Event/metric | Threshold/window | Severity | Target | Immediate response / escalation | False positives |
|---|---|---|---|---|---|
| AI daily cost/call cap | any cap reached | critical | incident commander + AI owner | disable AI, compare OpenAI dashboard, preserve accounting | planned low ceiling |
| AI emergency disabled | any enablement | critical | incident commander | confirm operator action and reason | drills |
| suspected secret exposure | any credible indicator | critical | security owner | contain, rotate, invalidate, preserve evidence | scanner test strings |
| authorization denials | 10 cross-resource denials/5m or 3 actors | critical | security + DB owner | disable affected route, assess exposure | broken client IDs |
| database unavailable/migration mismatch | 2 readiness failures/2m | critical | platform + DB owner | stop promotion/writes; verify parity | maintenance window |
| provider reconciliation uncertainty | any | critical | AI + DB owner | disable AI and reconcile actual provider usage | transient post-call store error still requires review |
| account deletion partial failure | any | critical | privacy + incident commander | verify ban, finish Auth deletion, update ledger | none expected |
| backup restore failure | any drill/restore | critical | DB owner | isolate target, preserve logs, escalate | invalid drill fixture |
| application 5xx | >2% for 5m and >=20 requests | high | application owner | roll back app if correlated with deploy | low traffic |
| Redis unavailable | 3 failures/2m | high | platform owner | verify AI fail-closed and restore service | isolated timeout |
| rate-limit denials | >3x 7-day baseline/10m | high | security owner | identify feature/IP-HMAC distribution | legitimate launch traffic |
| Auth abuse/email failures | >20 throttles or 5 email failures/10m | high | Auth owner | tighten hosted limits/pause signup | email provider incident |
| stale credit/idempotency | any stale credit; >5 reconciliation rows | high | AI/DB owner | dry-run cleanup, investigate before apply | long-running test operation |
| DB/storage growth | >20% week-over-week | high | DB owner | identify table/bucket and retention | planned beta growth |
| malformed cookies | >20/10m | high | application owner | inspect deploy/client version | expired browser fleet |
| enforced CSP violations | >10 same directive/10m | high | application owner | return to report-only if functionality breaks | browser extensions |

Alert delivery, on-call targets, test alerts, and dashboards require an external provider and recorded evidence before being called active.
