import type { ReleaseNote } from "../lib/release-notes";

export function V1ReleaseNote({ release }: { release: ReleaseNote }) {
  const draft = release.status === "draft";
  return (
    <article className="release-entry" id={release.id}>
      <div className="release-dateline">
        <span>{draft ? "Draft — not released" : release.version}</span>
        {!draft && release.publishedAt ? <time dateTime={release.publishedAt}>{release.publishedAt}</time> : null}
      </div>
      <h2 className="app-section-title">{release.title}</h2>
      <p className="release-introduction">{release.summary}</p>
      {draft ? <p role="note">This is a preview of the V1 release notes. V1 has not launched. The final announcement will reflect the verified app, including Ask, and its actual release date.</p> : null}
      {release.sections.map(section => (
        <section id={section.id} key={section.id}>
          <h3 className="app-section-title">{section.title}</h3>
          {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        </section>
      ))}
    </article>
  );
}
