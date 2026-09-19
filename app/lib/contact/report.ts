import { createHash } from "node:crypto";

import { SUPPORT_EMAIL, MAX_SCREENSHOT_BYTES, CATEGORIES } from "./constants.ts";
export type ContactReport = { email: string; category: string; message: string; screenshot?: { content: string; filename: string } };

export function parseContactReport(value: unknown): ContactReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Check your report and try again.");
  const input = value as Record<string, unknown>;
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (email.length > 254 || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email)) throw new Error("Enter a valid email address so we can reply.");
  if (typeof input.category !== "string" || !CATEGORIES.some(category => category === input.category)) throw new Error("Choose a report type.");
  if (message.length < 10 || message.length > 5000) throw new Error("Describe what happened in 10–5,000 characters.");
  const result: ContactReport = { email, category: input.category, message };
  if (input.screenshot !== undefined && input.screenshot !== null) {
    if (typeof input.screenshot !== "string" || input.screenshot.length > Math.ceil(MAX_SCREENSHOT_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.screenshot)) throw new Error("Choose a PNG, JPEG or WebP screenshot under 2 MB.");
    const bytes = Buffer.from(input.screenshot, "base64");
    if (!bytes.length || bytes.length > MAX_SCREENSHOT_BYTES || bytes.toString("base64") !== input.screenshot) throw new Error("Choose a screenshot under 2 MB.");
    const extension = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "png"
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "jpg"
      : bytes.subarray(0,4).toString() === "RIFF" && bytes.subarray(8,12).toString() === "WEBP" ? "webp" : null;
    if (!extension) throw new Error("Choose a PNG, JPEG or WebP screenshot.");
    result.screenshot = { content: input.screenshot, filename: `screenshot.${extension}` };
  }
  return result;
}

export async function sendContactReport(report: ContactReport, config: { key: string; from: string }, transport: typeof fetch = fetch) {
  // Retry the exact same report without delivering duplicate email within the provider's 24-hour window.
  const reference = createHash("sha256").update(JSON.stringify(report)).digest("hex");
  const response = await transport("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json", "Idempotency-Key": `contact-${reference}` },
    body: JSON.stringify({
      from: config.from, to: [SUPPORT_EMAIL], reply_to: report.email,
      subject: `[Furvise beta] ${report.category}`,
      text: `Beta feedback\nReply address (provided by reporter): ${report.email}\nType: ${report.category}\nReference: ${reference.slice(0,12)}\n\n${report.message}`,
      ...(report.screenshot ? { attachments: [report.screenshot] } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("CONTACT_DELIVERY_FAILED");
  const data = await response.json() as { id?: unknown };
  if (typeof data.id !== "string" || !data.id) throw new Error("CONTACT_DELIVERY_FAILED");
  return reference.slice(0,12);
}
