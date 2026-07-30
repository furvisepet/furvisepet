# Incident response

Severity: SEV-1 is confirmed/likely cross-user exposure, destructive corruption, material secret leak or uncontrolled spend; SEV-2 is serious contained degradation/reconciliation; SEV-3 is limited failure; SEV-4 is informational. Roles are incident commander, security, application, database/privacy, communications, and scribe—even if one operator fills several roles.

For every incident: record safe request/operation references and UTC timeline; preserve provider/deploy/audit evidence without private payloads; contain; assess affected users/data/cost; rotate affected secrets; recover; decide communications with appropriate privacy/legal review; and complete a blameless follow-up. Do not promise statutory notification without jurisdiction-specific advice.

| Scenario | Detection/containment | Recovery |
|---|---|---|
| Secret leak | scanner/provider anomaly; revoke/rotate, disable affected feature | validate new credentials, audit use/history, redeploy |
| Account takeover | user report/Auth anomaly; revoke sessions/ban identity | identity verification, password/provider recovery, assess data changes |
| Cross-user exposure | authorization events/report; disable route and preserve logs | patch/test two-user boundary, assess records and communications |
| AI cost spike/API abuse | cap/denial spike; environment + Redis emergency disable | reconcile OpenAI billing, rotate key if needed, adjust reviewed ceilings |
| Auth/email abuse | throttle/delivery spike; tighten Dashboard limits or pause signup | restore SMTP/CAPTCHA, test generic flows |
| DB corruption/outage | readiness/integrity failure; stop writes/AI | isolated restore assessment or forward repair; never blind production restore |
| Redis/OpenAI/Supabase outage | readiness/provider events; rely on fail-closed/degraded behavior | provider recovery, verify accounting and stale reservations before re-enable |
| Malicious dependency | advisory/runtime evidence; stop deploy/build | pin/remove, rotate exposed build secrets, clean install, rebuild |
| Failed deployment | 5xx/smoke failure; application rollback | verify DB compatibility and forward-fix if migration wrote data |
| Deletion failure | reconciliation event; ban identity | finish Auth deletion, validate no active data, update ledger |
| Restore failure | drill/restore errors; isolate target | retain evidence, correct runbook/backup source, repeat non-production drill |

Support asks users for only the safe reference `{requestId, operationId?, timestamp, code}`. Operators correlate it with allowlisted structured events; support never requests passwords, tokens, CAPTCHA responses, reset links, or pet narratives.
