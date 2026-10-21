"use client";
import { useEffect, useState } from "react";
import type { HistorySourceMetadata } from "../lib/history-source-metadata";

export function HistorySourceDetails({ recordId, subjectId, revision }: { recordId: string; subjectId: string; revision: string }) {
  const [open, setOpen] = useState(false), [refresh, setRefresh] = useState(0);
  const [snapshot, setSnapshot] = useState<HistorySourceMetadata | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setSnapshot(null); setError("");
    const params = new URLSearchParams({ subjectId, revision });
    void fetch(`/api/care-entries/${encodeURIComponent(recordId)}?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Current source details are unavailable. The saved record may have changed or been removed."); return response.json() as Promise<HistorySourceMetadata>; })
      .then(value => { if (!controller.signal.aborted) setSnapshot(value); })
      .catch(() => { if (!controller.signal.aborted) setError("Current source details are unavailable. Refresh History before relying on this snapshot."); });
    return () => controller.abort();
  }, [open, refresh, recordId, subjectId, revision]);
  return <details className="mt-5 break-words text-sm" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Saved source details</summary>
    <p>This records what was saved, not certified clinical truth. Sources can change after a read.</p>
    <button type="button" className="min-h-11 underline" onClick={() => setRefresh(n => n + 1)}>Read current details</button>
    {error ? <p role="alert">{error}</p> : open && !snapshot ? <p role="status">Reading current source details…</p> : null}
    {snapshot ? <div data-ui="history-source-metadata">
      {snapshot.matchesExpectedRevision === false ? <p role="status">The source revision changed. Refresh History to see its current contents.</p> : null}
      <dl><dt>Source ID</dt><dd>{snapshot.recordId}</dd><dt>Subject ID</dt><dd>{snapshot.subjectId}</dd>
      <dt>Revision</dt><dd>{snapshot.revision}</dd><dt>Read at</dt><dd>{snapshot.observedAt}</dd>
      <dt>Body SHA-256</dt><dd>{snapshot.bodySHA256}</dd><dt>Source snapshot SHA-256</dt><dd>{snapshot.snapshotSHA256}</dd></dl>
      <p>Numeric text candidates ({snapshot.spanCoverage.complete ? "complete within this body" : "capped; incomplete"}). These do not establish calculation eligibility.</p>
      <ul>{snapshot.numericSpans.map(span => <li key={`${span.start}:${span.end}`}><q>{span.quote}</q> · {span.sourceUnit} → {span.unit} · UTF-16 [{span.start}, {span.end})</li>)}</ul>
    </div> : null}
  </details>;
}
