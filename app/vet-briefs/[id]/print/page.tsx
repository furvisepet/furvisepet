"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { VetBriefDocumentView } from "../../../components/vet-brief-document";
import { useRequireConfirmedSupabaseAuth } from "../../../lib/auth-session";
import { getBrowserSupabase } from "../../../lib/supabase";
import type { VetBriefRecord } from "../../../lib/vet-brief/types";

export default function VetBriefPrintPage() {
  const params = useParams<{ id: string }>();
  const { status: authStatus } = useRequireConfirmedSupabaseAuth();
  const [brief, setBrief] = useState<VetBriefRecord | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authStatus !== "signedIn" || !params.id) return;
    let active = true;
    async function load() {
      try {
        const client = getBrowserSupabase();
        const { data } = client ? await client.auth.getSession() : { data: { session: null } };
        const token = data.session?.access_token;
        if (!token) throw new Error("Please sign in again.");
        const response = await fetch(`/api/vet-briefs/${encodeURIComponent(params.id)}`, { headers: { Authorization: `Bearer ${token}` } });
        const payload = await response.json().catch(() => null) as { brief?: VetBriefRecord; error?: string } | null;
        if (!response.ok || !payload?.brief) throw new Error(payload?.error || "That brief is not available.");
        if (active) setBrief(payload.brief);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "That brief is not available.");
      }
    }
    void load();
    return () => { active = false; };
  }, [authStatus, params.id]);

  return (
    <main className="vet-brief-print-route min-h-screen bg-[var(--pw-document-paper)] text-[var(--pw-document-text)]">
      <div className="print-controls mx-auto flex max-w-[8.5in] flex-col gap-3 p-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-xs leading-5 text-[var(--pw-document-muted)]">For a consistent professional result, prefer Download PDF. Browser-added date, title, URL, and page count are controlled by your browser’s “Headers and footers” print setting.</p>
        <div className="flex shrink-0 gap-2"><button className="min-h-11 rounded-full border border-[var(--pw-document-border)] px-5 text-sm font-semibold" onClick={() => window.close()} type="button">Close</button>
        <button className="min-h-11 rounded-full bg-[var(--pw-primary)] px-5 text-sm font-semibold text-[var(--pw-primary-foreground)] hover:bg-[var(--pw-primary-hover)]" onClick={() => window.print()} type="button">Print</button></div>
      </div>
      {error ? <p className="mx-auto max-w-2xl p-6 text-[var(--pw-danger-text)]">{error}</p> : brief ? <VetBriefDocumentView document={brief.document} version={brief.version} /> : <p className="p-6 text-center text-[var(--pw-document-muted)]">Preparing print view...</p>}
    </main>
  );
}
