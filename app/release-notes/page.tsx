import Link from "next/link";
import { V1ReleaseNote } from "../components/v1-release-note";
import { PageHeader } from "../components/product-primitives";
import { SiteFooter } from "../components/site-footer";
import { PublicPageHeader } from "../components/homepage-client";
import { getV1ReleaseForPage } from "../lib/release-notes";
import { createPublicPageMetadata } from "../lib/seo";

const preview = process.env.VERCEL_ENV === "preview";
const release = getV1ReleaseForPage({ preview });

export const metadata = {
  ...createPublicPageMetadata({
    title: release ? `Furvise V1 release notes${release.status === "draft" ? " (draft)" : ""}` : "Release notes",
    description: release ? `${release.status === "draft" ? "Unpublished draft. " : ""}${release.summary}` : "Product updates for Furvise. Release notes are published when a release is ready.",
    path: "/release-notes",
  }),
  ...(preview || !release ? { robots: { index: false, follow: false } } : {}),
};

export default function ReleaseNotesPage() {
  return (
    <div className="homepage-site homepage-refined release-notes-page">
      <PublicPageHeader />
      <main className="release-main">
        <div className="release-heading">
          <PageHeader
            eyebrow={release?.status === "draft" ? "Release notes · V1 draft: not released" : "Release notes"}
            title={release ? "Furvise V1" : "Release notes"}
            supportingText={release ? release.summary : "Product updates, when they are ready to share."}
          />
        </div>
        <div className="release-layout">
          <aside className="release-index">
            {release ? <a className="release-date-link" href={`#${release.id}`}>{release.status === "draft" ? "V1 draft: not released" : "Furvise V1"}</a> : null}
            <Link href="/contact">Report a problem ↗</Link>
          </aside>
          <div>
            {release ? <V1ReleaseNote release={release} /> : (
              <section className="release-entry" aria-label="Release updates">
                <h2 className="app-section-title">No published release updates</h2>
                <p>New release notes will appear here after the release is ready.</p>
              </section>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
