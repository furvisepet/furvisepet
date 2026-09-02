# Final global UI polish QA

Measured locally on 2026-09-02 from `codex/final-global-ui-polish`, based on `19d77c2f0dc2d5b51ae19782e3e8e1fe615fddc3`.

## Shared system authority

- Normal signed-in pages render through `AppPage` -> `PageShell preset="app"` -> `PageHeader`.
- The canonical rail is `min(1180px, calc(100% - 96px))` on desktop, with 20px mobile gutters.
- The canonical page-top rhythm is 64px after the desktop header and 32px after the mobile header.
- Page eyebrows, H1s, subtitles, section headings, controls, and loading copy are owned by shared semantic classes in `app/globals.css` and `app/components/product-primitives.tsx`.
- Marketing, auth, onboarding, and membership pricing cards retain their documented visual exceptions.

## Geometry measurements

Measurements came from browser `getBoundingClientRect()` and computed styles after content settled. They were not estimated from screenshots.

| Viewport | Content left X | Content width | Page-header top Y | Eyebrow | H1 | Subtitle | Header-to-content gap | Body | Focus |
| --- | ---: | ---: | ---: | --- | --- | --- | ---: | --- | --- |
| 1440 x 900 | 130px | 1180px | 121px | Inter 13px / 700 | Barlow Condensed 51.84px / 700 / 50.8px line | Inter 18px / 27.9px line | 48px | Inter 16px / 25.6px line | `#205C38` |
| 390 x 844 | 20px | 350px | 87px | Inter 13px / 700 | Barlow Condensed 40px / 700 / 40px line | Inter 16px / 24.8px line | 32px | Inter 16px / 25.6px line | `#205C38` |
| 375 x 667 | 20px | 335px | 87px | Inter 13px / 700 | Barlow Condensed 40px / 700 / 40px line | Inter 16px / 24.8px line | 32px | Inter 16px / 25.6px line | `#205C38` |

The desktop signed-in homepage and app headers also measured identically: logo x=54/y=9/144x36, navigation x=528/y=6/384x44, and account utility x=1304/y=6/82x44.

## Normal page consistency audit

Every row below measured the same canonical rail, header top, eyebrow, H1, subtitle, body, and focus values shown above at both 1440px and 390px unless an intentional content exception is noted.

| Page | Final orientation / task heading | Section rhythm | Primary action treatment | Overflow |
| --- | --- | --- | --- | --- |
| Today | TODAY / Anything you want Furvise to remember? | 48px desktop, 32px mobile | Forest, warm cream, 44px, 10px radius | 0px |
| Today, no pet | TODAY / Start with your pet | 48px / 32px | Forest, warm cream, 44px, 10px radius | 0px |
| Pets | PETS / Your pets | 48px / 32px | Forest, warm cream, 44px, 10px radius | 0px |
| History | HISTORY / Find something you've saved. | 48px / 32px | No primary action in the initial archive state; controls use warm white and forest focus | 0px |
| Ask | ASK / WHAT'S ON YOUR MIND ABOUT {PETNAME}? | 48px / 32px | Forest, warm cream, shared 48px control; starters unchanged | 0px |
| Pet profile | PETS / {PETNAME} | 48px / 32px | Forest Edit Pet action, 44px, 10px radius | 0px |
| Edit Pet | PETS / EDIT {PETNAME} | 48px / 32px | Forest Save Changes action, 48px, 10px radius | 0px |
| Account settings | ACCOUNT / ACCOUNT SETTINGS | 48px / 32px | Category-specific actions only; shared settings shell | 0px |
| Login & security | ACCOUNT / ACCOUNT SETTINGS; LOGIN & SECURITY content heading | 48px / 32px | Forest setup/change-password authority retained | 0px |
| Data & privacy | ACCOUNT / ACCOUNT SETTINGS; DATA & PRIVACY content heading | 48px / 32px | Forest download; destructive remains red | 0px |
| Membership | ACCOUNT / MEMBERSHIP | 48px / 32px | Approved pricing-card pill exception, forest/cream | 0px |

At the bottom of mobile Ask, the composer ended at y=728 and the dock began at y=744: 16px clearance and no overlap. Mobile navigation contained exactly Today, History, Ask, and Pets. Account remained the top-right utility.

## Visual capture matrix

Local captures are in the ignored `output/final-global-ui-polish/` directory.

Desktop, 1440 x 900:

- signed-out homepage
- signed-in homepage and open account menu
- Today empty and populated
- Pets empty and populated
- pet profile
- Edit Pet
- History empty and populated
- Ask without and with a selected pet
- Account details
- Login & security
- Data & privacy
- Membership Free, Plus, and internal QA
- login and create-account mode
- onboarding/plan-limit smoke state

Mobile, 390 x 844:

- signed-in homepage and open account menu
- Today
- Pets
- History
- Ask top and bottom/composer states
- pet profile
- Edit Pet
- Account settings
- Login & security
- Membership Free and Plus
- login and create-account mode
- onboarding/plan-limit smoke state

Compact mobile, 375 x 667:

- Today
- Ask
- Membership
- Account

## Color and control audit

- `--primary-action-background`, hover, and active resolve to deep forest/forest, with warm cream foreground.
- `--pw-accent` resolves to forest; the compatibility `--accent-apricot` alias resolves to sage.
- Legacy orange primitives remain defined for compatibility, but no normal V1 action or focus semantic points to them.
- `soft-orange` remains only for warning semantics. Destructive actions remain red.
- History controls use `--input-background`, `--input-border`, and forest focus; mint is not the default input fill.
- Shared product buttons use 48px height and 10px radius. Explicit compact page actions remain at least 44px. Membership card CTAs retain their approved pill exception.

## Favicon and app icons

- All derivatives were regenerated from the unchanged approved heron source (`5BC3424AFD22BBA0391D302494C506455DF9EF3A2221525C32A033E8DDA0DD0B`).
- Browser favicons now have an opaque `#F7F4E8` background and additional tiny-size safe padding.
- Automated pixel checks confirm opaque cream corners for favicon 16/32, Apple 180, Android 192/512, and maskable 512.
- Manifest background remains `#F7F4E8`; theme color remains `#123F27`; maskable purpose remains valid.

## Accessibility and stability

- Automated axe WCAG A/AA checks reported zero violations on Today, Pets, History, Ask, Account, Login & security, Data & privacy, and Membership.
- Axe left two manual-review items: it cannot resolve the closed account menu's generated `aria-controls` target, and it cannot infer contrast behind image-backed mobile-navigation labels/decorative checkmarks. These are incomplete checks, not reported violations, and the account utility/navigation implementation was intentionally unchanged.
- All normal pages had zero settled horizontal overflow at 1440, 390, and 375 pixels.
- Keyboard focus remains a visible 2px forest outline/ring.
- Product touch targets remain at least 44px.
- Loading copy now uses one quiet shared treatment without a large spinner.

## Behavior boundaries

The QA pass used real existing routes and a disposable authenticated QA identity. One temporary pet and one temporary History entry exercised populated states. Membership Plus and internal-QA displays used browser-level read-only response fixtures; checkout, portal, entitlement, and billing code were not invoked or modified. The disposable identity and its records were removed after QA.
