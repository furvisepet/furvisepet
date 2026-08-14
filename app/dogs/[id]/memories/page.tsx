"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "../../../components/app-page";
import { EmptyState, LoadingState, Notice, PageHeader, SecondaryButton } from "../../../components/product-primitives";
import { useRequireConfirmedSupabaseAuth } from "../../../lib/auth-session";
import { formatPetDisplayName } from "../../../lib/petwise";
import { buildRememberedDetails, type RememberedDetail } from "../../../lib/remembered-details";
import { getBrowserSupabase, loadCanonicalRememberedDetailsForUser, loadDogProfileWithMemoriesForUser, type CanonicalRememberedDetailsRows, type DogProfileWithMemories } from "../../../lib/supabase";
import { idempotentClientFetch } from "../../../lib/security/idempotency/client";
import { useAppDataVersion } from "../../../lib/navigation/app-data-freshness";

export default function RememberedDetailsPage() {
  const appDataVersion = useAppDataVersion();
  const params = useParams<{ id: string }>();
  const { status, user } = useRequireConfirmedSupabaseAuth();
  const [profile, setProfile] = useState<DogProfileWithMemories | null>(null);
  const [rows, setRows] = useState<CanonicalRememberedDetailsRows>({ canonical: [], legacy: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchDetails = useCallback(async () => {
    if (status !== "signedIn" || !user) return;
    return Promise.all([
      loadDogProfileWithMemoriesForUser(params.id, user),
      loadCanonicalRememberedDetailsForUser(params.id, user),
    ]);
  }, [params.id, status, user]);

  const refresh = useCallback(async () => {
    const result = await fetchDetails();
    if (!result) return;
    const [profileRow, memoryRows] = result;
    setProfile(profileRow);
    setRows(memoryRows);
  }, [fetchDetails]);

  useEffect(() => {
    if (status !== "signedIn" || !user) return;
    let active = true;
    fetchDetails().then((result) => {
      if (!active || !result) return;
      setProfile(result[0]);
      setRows(result[1]);
    }).catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "Remembered details could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appDataVersion, fetchDetails, status, user]);

  const name = profile ? formatPetDisplayName(profile.name) : "your pet";
  const details = useMemo(() => buildRememberedDetails({ canonical: rows.canonical, legacy: rows.legacy, petName: name }), [name, rows]);

  async function updateMemory(id: string, action: "confirm" | "edit" | "forget", value?: string) {
    setError("");
    setSuccess("");
    const client = getBrowserSupabase();
    const { data } = client ? await client.auth.getSession() : { data: { session: null } };
    const token = data.session?.access_token;
    if (!token) throw new Error("Please sign in again.");
    const response = await idempotentClientFetch(`/api/memories/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, value }),
    }, `memory:${action}:${id}`);
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) throw new Error(payload?.error || "That remembered detail could not be updated.");
    await refresh();
    setSuccess(action === "forget" ? "Forgotten. Furvise will no longer use that detail." : action === "confirm" ? "Detail confirmed." : "Remembered detail updated.");
  }

  return <AppPage layout="focused" shell="reading">
    <PageHeader eyebrow={<Link className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] px-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" href={`/pets/${params.id}`}>← {profile ? name : "Pet"} profile</Link>} title="Remembered details" supportingText="Useful details Furvise learns from your conversations appear here. You can correct or remove them anytime." />
    {loading ? <LoadingState label="Loading remembered details" /> : null}
    {error ? <div className="mt-6"><Notice tone="warning">{error}</Notice></div> : null}
    {success ? <div className="mt-6"><Notice>{success}</Notice></div> : null}
    {!loading && !error && profile ? <section className="mt-8">
      {details.all.length ? <div className="grid gap-8">
        {details.pet.length ? <MemoryGroup heading={`About ${name}`} memories={details.pet} onUpdate={updateMemory} /> : null}
        {details.owner.length ? <MemoryGroup heading="Your preferences" memories={details.owner} onUpdate={updateMemory} /> : null}
      </div> : <EmptyState action={<SecondaryButton href={`/pets/${profile.id}`}>Back to {name}&apos;s profile</SecondaryButton>} description="Useful preferences and routines Furvise learns over time will appear here. You can edit or remove them whenever needed." title="No remembered details yet" />}
    </section> : null}
  </AppPage>;
}

function MemoryGroup({ heading, memories, onUpdate }: { heading: string; memories: RememberedDetail[]; onUpdate: (id: string, action: "confirm" | "edit" | "forget", value?: string) => Promise<void> }) {
  return <section aria-labelledby={`memory-${heading.replace(/\s+/g, "-").toLowerCase()}`}>
    <h2 className="text-xl font-semibold text-[var(--text-primary)]" id={`memory-${heading.replace(/\s+/g, "-").toLowerCase()}`}>{heading}</h2>
    <ul className="mt-3 grid gap-3">{memories.map((memory) => <MemoryCard key={`${memory.source}:${memory.id}`} memory={memory} onUpdate={onUpdate} />)}</ul>
  </section>;
}

function MemoryCard({ memory, onUpdate }: { memory: RememberedDetail; onUpdate: (id: string, action: "confirm" | "edit" | "forget", value?: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(memory.editableValue);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  async function act(action: "confirm" | "edit" | "forget") {
    if (busy || memory.source !== "canonical") return;
    setBusy(true); setLocalError("");
    try { await onUpdate(memory.id, action, action === "edit" ? value : undefined); setEditing(false); }
    catch (cause) { setLocalError(cause instanceof Error ? cause.message : "That detail could not be updated."); }
    finally { setBusy(false); }
  }
  return <li className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-primary)] p-4 text-[var(--text-primary)]">
    {editing ? <div className="grid gap-3"><label className="text-sm font-semibold" htmlFor={`memory-edit-${memory.id}`}>Update this detail</label><input className="min-h-11 rounded-xl border border-[var(--line)] bg-white px-3" id={`memory-edit-${memory.id}`} maxLength={500} onChange={(event) => setValue(event.target.value)} value={value} /></div> : <p className="leading-7">{memory.fact}</p>}
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]">
      <span>{memory.category}</span>
      {memory.needsConfirmation ? <span className="font-semibold text-[var(--warning-text)]">Needs confirmation</span> : null}
      {memory.needsConfirmation ? <span>Last confirmed {formatDate(memory.lastConfirmedAt)}</span> : null}
    </div>
    {localError ? <p className="mt-3 text-sm text-[var(--danger-text)]" role="alert">{localError}</p> : null}
    {memory.source === "canonical" ? <div className="mt-3 flex flex-wrap gap-4">
      {editing ? <><button className="min-h-11 text-sm font-semibold underline-offset-4 hover:underline disabled:opacity-60" disabled={busy || !value.trim()} onClick={() => void act("edit")} type="button">{busy ? "Saving..." : "Save"}</button><button className="min-h-11 text-sm font-semibold underline-offset-4 hover:underline disabled:opacity-60" disabled={busy} onClick={() => setEditing(false)} type="button">Cancel</button></> : <button className="min-h-11 text-sm font-semibold underline-offset-4 hover:underline" disabled={busy} onClick={() => setEditing(true)} type="button">Edit</button>}
      {memory.needsConfirmation && !editing ? <button className="min-h-11 text-sm font-semibold underline-offset-4 hover:underline disabled:opacity-60" disabled={busy} onClick={() => void act("confirm")} type="button">{busy ? "Confirming..." : "Confirm"}</button> : null}
      {!editing ? <button className="min-h-11 text-sm font-semibold underline-offset-4 hover:underline disabled:opacity-60" disabled={busy} onClick={() => void act("forget")} type="button">{busy ? "Updating..." : "Forget"}</button> : null}
    </div> : null}
  </li>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "recently" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}
