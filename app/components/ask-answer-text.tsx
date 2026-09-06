/** Plain text only: preserve source punctuation without HTML/Markdown
 * interpretation, and keep connected answer paragraphs readable. */
export function AskAnswerText({ text, afterHeading = false }: { text: string; afterHeading?: boolean }) {
  return <div className={`${afterHeading ? "mt-1.5 " : ""}space-y-3 [overflow-wrap:anywhere] text-[1.05rem] leading-7 text-[var(--pw-text)]`}>
    {text.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p className="whitespace-pre-wrap" key={index}>{paragraph}</p>)}
  </div>;
}
