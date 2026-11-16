# Archived September 15, 2026 beta article

Removed from the public release-notes experience at G's request on November 16, 2026. Historical source only; not a current feature announcement. The original route also remains recoverable in Git commit 06adc805.

```tsx
            <article id="september-15-2026" className="release-entry">
              <div className="release-dateline"><time dateTime="2026-09-15">September 15, 2026</time><span>Public beta</span></div>
              <p><strong>Historical public-beta update.</strong> This dated entry describes earlier testing. It is not the Furvise V1 announcement.</p>
              <p className="release-introduction">Most pet care happens at home. You notice a change, try a different food, or want to remember something for the next appointment. Furvise gives you a place to record those details and return to them later.</p>
              <p>During testing, we found cases where a simple request to save a note failed because Ask couldn’t confidently interpret it. We also found questions where missing history prevented an otherwise useful answer. This update addresses those problems and adds a way to report issues directly from the app.</p>

              <section id="saving-notes">
                <h2 className="app-section-title">Saving a note shouldn’t depend on AI understanding it</h2>
                <p>You don’t need to describe an observation in clinical terms. “He seemed a bit slower on our walk, but ate dinner normally” is a useful record, even if its meaning is uncertain.</p>
                <p>Previously, saving a care note could depend on the same process that interpreted symptoms. We’ve separated those steps. When you ask Furvise to save a valid note for your pet, it saves your words independently of the optional AI interpretation. Low confidence in that interpretation should no longer prevent the note from being recorded.</p>
                <p>This also keeps a distinction between what you observed and what AI might infer. A description of a quieter walk is an owner observation; it isn’t, by itself, a diagnosis.</p>
                <figure className="release-example">
                  <figcaption>Example request</figcaption>
                  <blockquote>“Rowan was a little sluggish on our walk at 7:30 this evening, but ate his dinner normally. Save this to his care history.”</blockquote>
                  <p>The observation can be recorded without first deciding what caused the change. Check the save status separately from the answer: a written response alone is not proof that a note was saved.</p>
                </figure>
              </section>

              <section id="asking-about-history">
                <h2 className="app-section-title">More useful answers about earlier notes</h2>
                <p>A question may ask Furvise to do several things at once: save today’s observation, compare it with an older entry, and explain what the comparison shows. We’ve improved how Ask handles these combined requests so a missing piece of history doesn’t prevent it from addressing the parts it can support.</p>
                <p>We’ve also worked on weight comparisons, questions about earlier care plans, and the difference between the date an event happened and the date you entered it. If you log a Monday observation on Wednesday, those dates mean different things and should not be treated as interchangeable.</p>
                <figure className="release-example">
                  <figcaption>Example question</figcaption>
                  <blockquote>“I entered this note today, but the food change happened last Friday. When did we change her food?”</blockquote>
                  <p>The relevant date is the date of the food change. If the note doesn’t establish that date clearly, the answer should explain the uncertainty.</p>
                </figure>
                <p>There is also a difference between a number you include in a question and an entry Furvise can retrieve from saved history. Ask should make that source clear. If it cannot verify an older entry, that does not mean the entry never existed or the event never happened.</p>
              </section>

              <section id="vet-briefs">
                <h2 className="app-section-title">Keeping dates clear in vet briefs</h2>
                <p>A useful vet brief needs more than a list of observations. The order and timing can matter, especially when you recorded several events together or added an older note later.</p>
                <p>We’ve improved how vet briefs preserve the event dates supplied in your notes. The aim is to make the sequence easier to follow without substituting the date the note was entered for the date something happened.</p>
                <p>Review a brief before sharing it. Check names, dates, weights, and any references to medication against your original records. A brief is a summary of the information you’ve provided, not a veterinary assessment.</p>
              </section>

              <section id="feedback">
                <h2 className="app-section-title">Report a problem without leaving your question</h2>
                <p>The new <Link href="/contact">Contact us page</Link> accepts bug reports and an optional screenshot. The feedback link in Ask opens in a separate tab, so you can report a failed answer while keeping your conversation and draft open.</p>
                <p>Tell us what you were trying to do, what happened, and what you expected. If an answer failed, include the question or an excerpt you’re comfortable sharing. Reports do not automatically include your pet’s history or the contents of your conversation.</p>
                <p>You can also email <a href="mailto:supportfurvise@gmail.com">supportfurvise@gmail.com</a>. These release notes are where we’ll explain product changes as we make them.</p>
              </section>

              <section id="limitations">
                <h2 className="app-section-title">What still needs improvement</h2>
                <p>Furvise is in public beta. Answers can be incomplete or wrong. This update fixes specific failure cases; it does not mean every question will be answered correctly.</p>
                <ul className="release-limitations">
                  <li><strong>History may be incomplete.</strong> Ask can miss relevant context or be unable to verify an entry. Check the original notes when a detail matters.</li>
                  <li><strong>A save can still fail.</strong> Separating interpretation from saving removes one cause of failure. Connection and service problems can still occur. Check the save confirmation before assuming an observation has been recorded.</li>
                  <li><strong>Summaries need review.</strong> AI can misread dates, omit details, or draw an unsupported connection. Review generated answers and vet briefs before relying on them.</li>
                  <li><strong>Furvise does not replace veterinary care.</strong> It helps organize information and prepare questions. It does not diagnose your pet or decide treatment.</li>
                </ul>
                <p>Our next improvements will be informed by the problems people encounter using Furvise. If a basic task fails or an answer doesn’t make sense, a report with the steps you took helps us investigate.</p>
              </section>
            </article>
```
