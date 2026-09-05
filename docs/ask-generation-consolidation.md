# Ask generation consolidation

Base: b64cf96cbc013a21ac936b5358bc64b0aa5c6a8d.

Removed the route-local buildTurnGenerationInput and the orchestrator's second generation payload. Repository caller search confirmed the Ask route is the only production orchestrator caller; its closure already ignores that payload and calls generateAskHistoryAnswer with live context and authorized subject IDs.

The orchestrator now supplies only concernStateHint. Existing classification, deterministic response, safety and suggestion behavior remain tested. Actual generation still owns bounded history/episode retrieval, evidence construction, governance and final validation through generateAskHistoryAnswer and runFurviseIntelligence.

Updated six existing test call sites/files to remove obsolete generationInput fixtures; all assertions were retained. This is deletion of a redundant execution input, not removal of historical records or incomplete-history requirements.

Verification: default suite 2,198 passed; six evidence/history/episode/subject/status audits 172 passed; typecheck passed. Initial lint found an import made unused by this cleanup; it was removed. Final changed-file lint and diff checks are recorded at commit verification.

Scope limits: this is the first verified consolidation seam. Legacy memory projections, V2 governance and persistence destinations still have active callers and were not proven removable by this review. No data, schema, migration or lifetime audit expectation was deleted. Last lifetime result remains 8 passed/9 failed; that audit was not rerun for this behavior-preserving cleanup. No HTTP, live-provider or production-database test, push, merge or deployment.
