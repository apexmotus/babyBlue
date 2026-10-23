# DESIGN SYSTEM

Tokens are CSS custom properties in `src/app/globals.css` (`:root`). Marketing components live in `src/app/(site)/site.css` (prefixed `x-`) and `src/components/site/`. The product UIs (Flow demo, future App/OS) use the unprefixed classes in `globals.css`.

## Tokens
Brand: `--deep --connected --sky --cloud --sage --link`. Semantic: `--primary --accent --bg --surface --border --ink --ink-2 --ink-3 --chip`, status `--warn --err` and tints. Shadows `--shadow --shadow-lg`. Fonts `--font-inter`, `--font-manrope` (`--font-head`).

## Marketing components (`src/components/site/`)
| Component | Notes |
|---|---|
| `Nav` | Sticky; mobile drawer with Esc to close, `aria-expanded`, current-page state |
| `Footer` | Link groups, emergency-number disclaimer |
| `Section`, `Head`, `PageHero` | Layout, eyebrow + heading + lead |
| `Btn` | `primary`, `outline`, `light`; `x-btn-sm`; arrow micro-interaction |
| `PhotoSlot` | Art-directed placeholder with brief; swap for `next/image` |
| `FeatureList`, `Faq`, `CtaBand` | Content patterns (`details/summary` FAQ, keyboard-native) |
| `PhoneMock`, `LaptopMock`, `MockCaption` | Illustrative UI, em-scaled with container queries |
| `LeadForm` | Contact form: labelled fields, `aria-invalid`, `aria-describedby`, focus on first error, status regions |

## Product components (`src/components/ui.tsx`, `question.tsx`, `staff-modals.tsx`)
`Modal` (Esc, focus-safe overlay), `Field`, `Switch`, `Banner`, `Empty`, `StatusPill`, `Toast` provider, appointment/queue rows and tables, `QuestionInput`.

## Patterns
- **Cards:** 24px radius, 1px `--border`, soft shadow; hover lift on links.
- **Buttons:** pills on marketing (min height 52px, 44px small); 12px-radius on product UI (44/56px).
- **Forms:** 16px input text (prevents iOS zoom), 52px height, visible focus ring, errors announced with `role="alert"`.
- **Empty/error/loading:** `Empty` component; forms show explicit `sending`, `not_configured` and `error` states.
- **Motion:** subtle rise/float only; disabled under `prefers-reduced-motion`.

## Accessibility
Skip link; one `h1` per page; landmarks (`header/nav/main/footer`); keyboard-operable menu and FAQ; visible `:focus-visible`; non-text content labelled (`role="img"` + `aria-label` on mockups); colour contrast per BRAND.md; touch targets ≥44px. Automated axe/Lighthouse runs are on the roadmap; manual checks done on desktop and 390px mobile.

## Responsive
Breakpoints 1080 / 820 / 600px. Hero stage collapses to stacked sections; grids step 4→2→1.
