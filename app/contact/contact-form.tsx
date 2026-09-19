"use client";

import { useRef, useState, type FormEvent } from "react";
import { CATEGORIES, MAX_SCREENSHOT_BYTES, SUPPORT_EMAIL } from "../lib/contact/constants";

const field = "mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-page)] px-4 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

export function ContactForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [filename, setFilename] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const screenshot = fileRef.current?.files?.[0];
    setError("");
    if (screenshot && (screenshot.size > MAX_SCREENSHOT_BYTES || !["image/png", "image/jpeg", "image/webp"].includes(screenshot.type))) {
      setError("Choose a PNG, JPEG or WebP screenshot under 2 MB."); return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const content = screenshot ? await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("We couldn't read that screenshot. Please choose it again."));
        reader.readAsDataURL(screenshot);
      }) : undefined;
      const response = await fetch("/api/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.get("email"), category: values.get("category"), message: values.get("message"), screenshot: content }),
        signal: AbortSignal.timeout(25_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 429 ? "You've sent several reports. Please try again later, or email us directly." : data.error || "We couldn't send your report. Please try again.");
      if (!data.reference) throw new Error("We couldn't confirm your report was sent. Please try again.");
      setReference(data.reference);
    } catch (failure) {
      setError(failure instanceof Error && failure.name !== "TimeoutError" && failure.name !== "TypeError" ? failure.message : "We couldn't confirm your report was sent. Your text and screenshot are still here. Please try again.");
    } finally { submitting.current = false; setBusy(false); }
  }

  if (reference) return <section role="status" className="rounded-2xl border border-[var(--line)] p-6 sm:p-8">
    <h2 className="text-2xl font-semibold">Thanks for helping us improve.</h2>
    <p className="mt-3">Your report has been submitted to Furvise support. We can reply to the email you provided.</p>
    <p className="mt-3 text-sm">Report reference: {reference}</p>
    <p className="mt-3 text-sm">If you opened this from Ask, your conversation is still in its original tab.</p>
    <button className="mt-6 min-h-11 underline underline-offset-4" type="button" onClick={() => { setReference(""); setFilename(""); }}>Send another report</button>
  </section>;

  return <form onSubmit={submit} className="space-y-6 rounded-2xl border border-[var(--line)] p-6 sm:p-8" aria-busy={busy}>
    <fieldset disabled={busy} className="space-y-6 disabled:opacity-70">
      <legend className="sr-only">Report a bug or share feedback</legend>
      <label className="block font-medium">Your email<input name="email" type="email" required maxLength={254} autoComplete="email" className={field} /><span className="mt-2 block text-sm font-normal">So we can follow up about your report.</span></label>
      <label className="block font-medium">What can we help with?<select name="category" className={field} defaultValue="Something is broken">{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
      <label className="block font-medium">What happened?<textarea name="message" rows={6} required minLength={10} maxLength={5000} className={`${field} resize-y`} placeholder="What were you trying to do? What happened instead? If Ask failed, tell us what you asked and any error you saw." /><span className="mt-2 block text-sm font-normal">Include the page and approximate time if you can. Up to 5,000 characters.</span></label>
      <div><label htmlFor="screenshot" className="block font-medium">Screenshot <span className="font-normal">(optional)</span></label><input ref={fileRef} id="screenshot" name="screenshot" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="screenshot-help" className="mt-3 block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border file:border-[var(--line)] file:bg-transparent file:px-4 file:py-3" onChange={event => setFilename(event.target.files?.[0]?.name || "")} />
        <p id="screenshot-help" className="mt-2 text-sm">PNG, JPEG or WebP, up to 2 MB. Crop out anything you don’t want to share with support.</p>
        {filename ? <button type="button" className="mt-2 min-h-11 text-sm underline" onClick={() => { if (fileRef.current) fileRef.current.value = ""; setFilename(""); }}>Remove screenshot</button> : null}
      </div>
      <p className="text-sm">Only what you submit here is sent to support. Your pet history and conversations aren’t attached automatically. <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">Privacy policy</a>.</p>
      <button type="submit" className="min-h-12 rounded-xl bg-[var(--text-primary)] px-6 py-3 font-semibold text-[var(--surface-page)] disabled:opacity-60">{busy ? "Sending…" : "Send report"}</button>
    </fieldset>
    {error ? <p role="alert" className="text-sm">{error}</p> : null}
    <p className="text-sm">Prefer email? <a className="underline underline-offset-4" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
  </form>;
}
