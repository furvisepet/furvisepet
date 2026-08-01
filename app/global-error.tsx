"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "var(--surface-page, #F7F4E8)", color: "var(--text-primary, #173023)", margin: 0 }}>
        <title>Something went wrong | Furvise</title>
        <main style={{ alignItems: "center", display: "flex", minHeight: "100vh", padding: "24px", justifyContent: "center" }}>
          <section aria-labelledby="global-error-title" style={{ background: "var(--surface-primary, #FFFDF7)", border: "1px solid var(--line, rgba(18, 63, 39, 0.14))", borderRadius: "var(--radius-xl, 28px)", boxShadow: "var(--shadow-surface-1, 0 8px 24px rgba(18, 63, 39, 0.07))", boxSizing: "border-box", maxWidth: "520px", padding: "clamp(24px, 6vw, 40px)", textAlign: "center", width: "100%" }}>
            <p style={{ color: "var(--ghost-action-foreground, #205C38)", fontSize: "14px", fontWeight: 700, letterSpacing: "0.04em", margin: "0 0 12px" }}>Furvise</p>
            <h1 id="global-error-title" style={{ fontSize: "clamp(30px, 8vw, 44px)", lineHeight: 1.08, margin: 0 }}>Something went wrong</h1>
            <p style={{ color: "var(--text-secondary, #405648)", fontSize: "16px", lineHeight: 1.65, margin: "16px auto 0", maxWidth: "430px" }}>Furvise ran into an unexpected problem. Refresh the page or try again in a moment.</p>
            <button onClick={() => window.location.reload()} style={{ background: "var(--action-primary, #F47A22)", border: 0, borderRadius: "var(--radius-pill, 999px)", color: "var(--primary-action-text, #173023)", cursor: "pointer", fontSize: "16px", fontWeight: 700, marginTop: "28px", minHeight: "48px", padding: "12px 24px" }} type="button">Refresh page</button>
          </section>
        </main>
      </body>
    </html>
  );
}
