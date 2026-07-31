# Furvise visual QA checklist

Use this checklist at 1440, 1280, 1024, 768, and 390 pixels wide.

## Current verification

- Automated source contracts cover hierarchy, navigation labels, action hierarchy, shared surfaces, copy, focus styles, mobile navigation, the Ask composer, and Vet Brief actions.
- Lint, production build, and the complete test suite pass.
- Screenshot review at the five target widths remains to be run when an in-app browser is available in the execution environment.
- Next.js 16's circular development route indicator (the bottom-left “N”) is disabled with `devIndicators: false` in `next.config.ts`; it is development-only and is not emitted by production builds. Keep that setting disabled during screenshot QA.

## Product hierarchy

- [ ] The current page and its purpose are clear from the first viewport.
- [ ] Each page has one visually dominant primary action.
- [ ] Secondary actions are quieter and do not compete with the primary action.
- [ ] Pet identity appears before pet-specific tasks or information.
- [ ] Content follows the shared 1120px grid and 760px reading column.

## Navigation

- [ ] Desktop navigation reads Today, Pets, History, Ask, Products.
- [ ] The selected desktop route uses a quiet underline treatment.
- [ ] Mobile navigation reads Today, History, Ask, Pets.
- [ ] Products remains reachable without occupying primary mobile navigation.
- [ ] Account access is visible, compact, and keyboard accessible.

## Spacing and typography

- [ ] Page header, section, and divider spacing is consistent.
- [ ] Body text stays readable without overly wide lines.
- [ ] The display serif appears only on the marketing homepage.
- [ ] Labels avoid unnecessary uppercase and letter spacing.
- [ ] No content floats in an excessively empty desktop canvas.

## Color and surfaces

- [ ] Only page, interactive, and overlay surfaces are used.
- [ ] The permanent product color system uses only the six approved neutral primitives and their accessible opacity variants.
- [ ] Page, raised, interactive, selected, navigation, and overlay surfaces remain visually distinct.
- [ ] No component contains an arbitrary color value.
- [ ] Focus, disabled, warning, danger, and selected states remain distinguishable.

## States and controls

- [ ] Empty states explain what happens next and include a useful action.
- [ ] Loading states reserve enough space and identify the task being loaded.
- [ ] Failure states are inline, calm, and actionable when retry is possible.
- [ ] Back and cancel behavior is clear in overlays and editing workflows.
- [ ] Destructive confirmation appears only when data loss is possible.
- [ ] Disabled controls communicate their state and remain legible.
- [ ] Drafts survive accidental navigation where the existing workflow supports drafts.

## Responsive behavior

- [ ] 1440 and 1280 layouts make full use of the shared grid.
- [ ] 1024 and 768 layouts deliberately recompose side content and actions.
- [ ] 390 layouts prioritize the task, pet, primary action, and readable content.
- [ ] The Ask composer remains reachable above mobile navigation.
- [ ] Sticky Vet Brief actions remain reachable above mobile navigation.
- [ ] No control or text creates horizontal scrolling.

## Content quality

- [ ] No page is assembled from redundant cards.
- [ ] No dead-end or duplicate control remains.
- [ ] No technical implementation language is visible.
- [ ] No AI, model, prompt, confidence, classification, retrieval, or analysis terminology is visible.
- [ ] No em dash character is visible.
- [ ] Safety copy remains deterministic and does not imply human review.
