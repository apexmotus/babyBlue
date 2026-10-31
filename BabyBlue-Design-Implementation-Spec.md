# BabyBlue: Design Implementation Spec

Version 3 (final), 25 October 2026. Owner: Apex Motus. Source design: the "BABY BLUE CANVAS" artifact (28 frames: 15 patient, 12 staff, plus a notes panel).

Version 3 makes this spec self-sufficient. You should be able to build both surfaces from this file alone, without opening the canvas, and get a visual match. To do that it adds:

- a full set of measured visual tokens (section 4);
- a component library with sizes and every state that is drawn (section 5);
- a frame-by-frame blueprint of all 27 drawn screens with verbatim copy (sections 8 and 9);
- specs for the screens your decisions added but the canvas does not draw (section 10);
- a list of every place where the build differs from the drawing, with the default choice (section 3).

It also aligns the stack with the companion database spec (`BabyBlue-Database-Implementation-Spec.md`): PostgreSQL, and stored functions and procedures as the only data access.

### How the visual values were obtained (read this once)

The canvas source code was not accessible, so every value in sections 4 to 9 was measured from the rendered canvas. The method was:

1. Each frame was captured at about 2.4 screen pixels per canvas pixel.
2. Colours were sampled from flat areas (median of a 7×7 patch).
3. Sizes were measured by pixel scans and converted to design pixels. The canvas draws frames at 73.6% scale: a 402px phone frame renders 296px wide, and the 1320px staff shell renders 972px wide.
4. Font sizes were derived from cap heights, using Inter's cap height of 0.727em.

Expect a tolerance of about ±1px on sizes and font sizes, ±2 on colour channels, and ±2px on radii. Where a value was snapped to a round number, the measured figure is close to it. The canvas notes say the original tokens come from the existing repo (`BabyBlueTheme.md`, `tailwind.config.ts`). If those files are available and differ by more than the tolerance, the repo wins for colour and type, and this spec wins for layout and copy. A value marked **(derived)** is not drawn on the canvas (for example a hover colour); it is a sensible default chosen to fit the drawn palette.

---

## Contents

1. Decisions locked in
2. Overview
3. Where the build differs from the drawing
4. Visual foundations (measured tokens)
5. Component library
6. Architecture and stack
7. Data model and visit rules
8. Patient screens, frame by frame (P1 to P15)
9. Staff screens, frame by frame (S1 to S12)
10. Screens and states the canvas does not draw
11. Queue, estimates, messaging and offline
12. POPIA, privacy and security
13. Build phases
14. Copy and content rules
15. Remaining open questions

---

## 1. Decisions locked in

| # | Question | Decision | Effect on the build |
| --- | --- | --- | --- |
| 1 | Product name | **BabyBlue** | Drop "ClinicOS" from the UI, repo strings, emails and domains. Use the square gradient mark in 4.6 (the canvas uses it as a neutral stand-in until a final logo exists). |
| 2 | Urgent patients | **Urgency flags the visit; an admin approves or declines moving it up, and must give a reason.** | New "Needs review" state on S4 and a decision dialog (10.3). Queue order never changes automatically. See 7.4. |
| 3 | IDs | **Needed for billing** | ID stays required at reception (S5, as drawn) and optional on the patient form (P6, as drawn), with an "ID missing" flag. See 7.5. |
| 4 | Consent withdrawal and retention | Explained in section 12 | Default proposed; needs a lawyer's check. |
| 5 | Minors | **A guardian or parent is required** | New "Who is this visit for?" control on P6 and S5 and guardian fields (10.1). See 7.6. |
| 6 | New practice approval | **Manual review** | New platform-admin screen S13 and a pending/declined screen (10.4, 10.5). |
| 7 | Messaging provider | **SendGrid** | SendGrid is email only. WhatsApp and SMS need a second provider. See 11.3. |
| 8 | Pricing | **R2,000 installation, then R200 per month** (to be updated) | Manual invoicing in the MVP. Check message costs against the R200 margin (11.4). |
| 9 | Stack | **Frontend: Next.js (PWA). Backend: .NET (MVC structure). Database: PostgreSQL** | Section 6. Data access through the stored routines in the database spec. |

---

## 2. Overview

BabyBlue is a two-surface product for South African clinics.

- **Patient app** (P1 to P15): mobile web, designed at a 402 × 874 viewport, no login. Patients scan a QR code, join a clinic's live queue from their phone, see an honest wait estimate, and get WhatsApp or SMS nudges.
- **Staff portal** (S1 to S13): desktop web, designed at a 1320px-wide shell with a 240px left navigation. Reception runs one live list, with bookings, intake answers and patient files alongside.

Both surfaces read one shared visit record. A staff action (Call, Mark seen, Cancel) changes the same status the patient screen renders, and each status keeps one pill colour on both surfaces.

---

## 3. Where the build differs from the drawing

Build every drawn screen to match the canvas, using sections 4 to 9. The table below lists every intentional difference, with the default this spec uses. If you prefer the other option, change the default here and nothing else needs to move.

### 3.1 Differences caused by your decisions (keep these)

| # | Where | Drawn | Build | Why |
| --- | --- | --- | --- | --- |
| A1 | All | Mark with "BabyBlue" wordmark | Same | Decision 1. The repo logo reading "ClinicOS" must not ship. |
| A2 | P6, S5 | No dependent path | Add the "Who is this visit for?" segmented control and guardian fields (10.1) | Decision 5 |
| A3 | S4, S7, S9 | No ID-missing state | Add the "ID missing" warning pill (5.6) next to the patient's phone line | Decision 3 |
| A4 | S4, S5, S7 | Urgent shown as a pill only | Add the "Needs review" pill, the review banner on S4, and the decision dialog (10.2, 10.3) | Decision 2 |
| A5 | Staff | No platform-admin screens | Add S13 Practice approvals and the Pending / Declined screen (10.4, 10.5) | Decision 6 |
| A6 | P5, P6 | No emergency line | Add one line below the info box: "If this is an emergency, call 10177 or go to the nearest emergency unit." (12px, slate-500) | Safety. Confirm the wording with the pilot practice. Remove only on the owner's instruction. |

### 3.2 Differences recommended in the review (default chosen)

| # | Where | Drawn | Default in this spec | Alternative |
| --- | --- | --- | --- | --- |
| B1 | P1 stat tiles | "31% fewer people in the waiting room at peak" and "4 min to set up your practice and print a code" | Build the tiles exactly as drawn, but render them only when a measured value is configured (`marketing.stats` is empty, so the row is hidden). The demo card and everything else render as drawn. | Show the drawn numbers. Not recommended: they are unmeasured claims. |
| B2 | P2, P3 | Dentist and small-clinic landings promise a standby list, procedure-length slots and multi-stream queues | Build both pages 1:1 behind a feature flag (`landing.variants`, off) until Phase 5 ships those features | Publish now |
| B3 | P4, P5, P10 | "Request a booking", "Book a time instead", "Book a follow-up · Open" | Build as drawn. In v1 each opens the practice's phone (`tel:`) or WhatsApp chat, because patient self-booking has no screens | Build patient self-booking (Phase 5) |
| B4 | P6 | "We recognised these details from this device. Nothing is stored until you join." | Build as drawn. The details are kept only in the browser's local storage, and "Not you? Clear and start fresh" deletes them | None |
| B5 | P13 | Two open questions on one screen, answered questions collapsed below | Build as drawn (8.13 explains the rule that produces the drawing) | One question per step (the v2 assumption, now dropped) |
| B6 | S1 brand panel | "Rosebank Family Practice · 3 staff accounts · POPIA operator agreement signed 4 March 2026" shown to a signed-out user | Keep the same style and position, but show "For South African practices · POPIA-ready" because a signed-out screen must not show a practice's details | Keep the drawn text (privacy leak) |
| B7 | Message links | "bby.co.za/q/8fd2" | Real links use a 22-character token, so the line is longer: `bby.co.za/q/` followed by the token | A short code (guessable, rejected) |

### 3.3 Inconsistencies inside the drawing (resolved)

| # | Drawn | Build |
| --- | --- | --- |
| C1 | The sidebar footer (signed-in name, role, Sign out) appears on S4 only | Show the footer on every staff screen |
| C2 | The "Admin · Settings" nav group is missing on S9 and S12, although the signed-in user is an Admin | Show it on every screen for Admins; hide it for other roles |
| C3 | Sample data disagrees between frames (Thabo is #3 on P7 but #1 on S4 and S7; the ID 890412… gives age 37 while S7 says 34) | Production computes everything from one record. For visual QA, a "canvas fixture" seed reproduces each frame's own data (6.5) |
| C4 | The canvas notes say buttons are 44 or 56px tall with a 12px radius | The drawing measures 52 or 56px (patient), 44px (staff), with a 10px radius. This spec uses the measured values |
| C5 | The canvas notes say "light shadow" on cards | No shadow is visible on any card. Cards are flat with a 1px border |
| C6 | The canvas notes give the background as #F7FAFC | Measured #F8FAFC (Tailwind slate-50) |
| C7 | The staff frames are labelled "1200px content column" | The main area is 1080px wide (1320 minus the 240px nav) with 28px padding. Above 1320px the content column caps at 1200px (9.0) |

---

## 4. Visual foundations (measured tokens)

Build one token layer and use it on both surfaces. Every hex value below was sampled from the canvas render. Section 4.8 gives a ready-to-paste Tailwind theme with the same names.

### 4.1 Colour

Colour carries meaning only. There are no decorative fills and no gradients, except the logo mark. A status colour always comes with a text label, and usually an icon.

**Brand and status colours**

| Token | Hex | Used for (as drawn) |
| --- | --- | --- |
| `primary-900` | `#073E78` | Staff sign-in brand panel (S1). Title "You're being seen now" (P9) |
| `primary-700` | `#094A8B` | Hover and pressed state of primary buttons **(derived)** |
| `primary-600` | `#0B5AA8` | **The primary colour.** Primary buttons, links, active nav item, selected tab, selected slot and scale value, progress bar, checkbox fill, queue position "#1" text, "Called today" value, info icons |
| `primary-300` | `#BACFEA` | Border of the in-consultation hero card (P9) |
| `primary-200` | `#C9DBF0` | Border of info banners (P6 "We recognised…", S3 Admin note) and the WhatsApp "ready" message bubble |
| `primary-100` | `#DFE8F3` | Focus ring on inputs (3px, outside the 1.5px primary border) |
| `primary-50` | `#EFF6FF` | Info banner fill, "In consultation" card fill (P9), avatar fill, soft-primary button fill ("Call"), pill fill for primary pills, icon tiles, hover row fill **(derived)** |
| `primary-25` | `#F9FBFF` | Highlighted table row (in-consultation row on S4, matched search row on S5, patient card in S6) |
| `accent-500` | `#1EC997` | Live dot, open-status dot, S3 "Go to queue" button fill, logo gradient end |
| `accent-600` | `#0DAE7B` | Positive text: "Open now — closes 17:00", "Confirmed", "Available", "Submitted", "Visit complete", "Valid ID — …", "WhatsApp" tag, "Active", "Mark seen" label, "Given" pill text, checkmark icons |
| `accent-200` | `#B9EED9` | Border of the Done hero card (P10) |
| `accent-50` | `#ECFDF5` | Fill of accent pills, "Mark seen" button, Done card (P10, measured `#E8F9F1` at the card centre because of the border blend; use `#ECFDF5`), success icon circles, step-done circle (S3) |
| `warning-500` | `#F59E0B` | Filled stars (P10), dashed border of an open standby slot (rendered at about 60%, `#F8C577`) |
| `warning-700` | `#B4550B` | Warning text: "Offline — reconnecting…", "Last confirmed 3 minutes ago", "Soon" pill text, "Open" standby text, "Already in queue", "Changing the slug breaks…", warning icons |
| `warning-800` | `#854D0E` | Body text inside warning banners (P8) |
| `warning-300` | `#FCD8A6` | Border of warning banners |
| `warning-50` | `#FFF6E8` | Warning banner fill, "Soon" pill fill, warm icon tile (Lunch blocked time, S10) |
| `error-600` | `#DC2626` | "Urgent" pill text |
| `error-500` | `#EF4444` | Destructive text and icons: "Yes, leave the queue", "Delete question", "Sign out" (device), required asterisk, warning triangle (P12) |
| `error-200` | `#FECACA` | Border of the destructive outline button |
| `error-50` | `#FEF2F2` | "Urgent" pill fill, destructive icon tile (P12) |

**Neutrals (Tailwind slate)**

| Token | Hex | Used for |
| --- | --- | --- |
| `slate-900` | `#0F172A` | Headings, primary text, names, values |
| `slate-700` | `#334155` | Strong secondary text (demo card label, waiting pill text) |
| `slate-600` | `#475569` | Body and secondary text, labels of stat cards, nav item text, icons |
| `slate-500` | `#64748B` | Muted icons (cancelled icon), helper text on dark-enough backgrounds |
| `slate-400` | `#94A3B8` | Placeholder text, disabled text, timestamps in message bubbles, drag handles |
| `slate-300` | `#CBD5E1` | Empty star outline, unchecked checkbox border, toggle-off track |
| `slate-200` | `#E2E8F0` | **All borders and dividers** |
| `slate-100` | `#F1F5F9` | Neutral pill fill, neutral soft buttons ("Cancel", "Open", "Edit", "Export file"), disabled fields |
| `slate-50` | `#F8FAFC` | **App background** on both surfaces, inset panels (demo card, consent box, footer bar of modals), the Sunday "Closed" row fields |
| `white` | `#FFFFFF` | Surfaces: cards, inputs, app bars, sidebar, modals |

**Overlay:** modal and bottom-sheet backdrop is `rgba(15, 23, 42, 0.46)` (slate-900 at 46%). This was measured as `#8F949E` over the slate-50 page. The content behind is not blurred.

### 4.2 Typography

**Font:** Inter (identified from the glyph shapes), loaded with `next/font/google`, `latin` subset, weights 400, 500, 600, 700 and 800, exposed as `--font-inter`. Use tabular figures (`font-variant-numeric: tabular-nums`) on every time, count, position and phone number. Headings use letter-spacing −0.01em; the queue-position display uses −0.02em.

Sizes are in px, as font size / line height.

| Role | Size / line | Weight | Colour | Where |
| --- | --- | --- | --- | --- |
| `display` | 56 / 56 | 800 | slate-900 | Queue position "#3" on P7, P12 backdrop. Offline (P8): slate-600 |
| `display-sm` | 42 / 44 | 800 | slate-900 | "#3" inside the P1 demo card |
| `h1-landing` | 26 / 32 | 700 | slate-900 | P1 to P3 hero headings |
| `stat-xl` | 26 / 30 | 700 | slate-900 | P5 "6" and "20–35" |
| `h1-staff` | 24 / 32 | 700 | slate-900 | Staff page titles ("Today's queue", "Patients", "Settings", "Sign in", "Set up your practice", patient names on S7 and S9) |
| `stat-l` | 28 / 32 | 700 | per stat | S4 stat values |
| `estimate-l` | 24 / 30 | 700 | slate-900 | S7 "Under 10 min" |
| `estimate-m` | 22 / 28 | 700 | slate-900 | P7 "20–35 min", P8 "Under 10 min" (slate-600), P1 "31%" and "4 min" (primary-600) |
| `h1-page` | 22 / 28 | 700 | slate-900 | P5 clinic name |
| `h1-compact` | 20 / 26 | 700 | slate-900 | P4 "Find a clinic"; status titles on P9 (primary-900), P10 (accent-600), P11, P12, P14 |
| `h2` | 18 / 24 | 600 | slate-900 | Section titles on landings ("How it works", "Built for a dental diary", "Common questions"); P3 stream counts |
| `appbar-title` | 17 / 22 | 600 | slate-900 | "Join the queue", "Quick intake", "What we'll send you" |
| `title-m` | 16 / 22 | 600 | slate-900 | App-bar practice name (P7 to P11); staff card titles ("Intake answers", "Notifications", "Visit history"); profile name |
| `button-l` | 16 / 20 | 500 | per variant | 56px patient buttons |
| `title-s` | 15 / 20 | 600 | slate-900 | Card row titles ("Complete quick intake", practice names on P4, feature titles), question prompts on P13 (16/22) |
| `body-l` | 15 / 24 | 400 | slate-600 | Landing paragraphs, P13 intro, P15 intro |
| `button-m` | 15 / 20 | 500 | per variant | 52px patient buttons, staff nav items (15/20, 500) |
| `body` | 14 / 22 | 400 | slate-600 or slate-900 | Card text, inputs (slate-900), table cells (slate-600), staff buttons (14/20, 500) |
| `label` | 14 / 20 | 500 | slate-900 | Patient form labels |
| `label-staff` | 13 / 18 | 500 | slate-900 | Staff form labels |
| `body-s` | 13 / 20 | 400 | slate-600 | Sub-lines, helper text, staff page subtitles, consent text |
| `caption` | 12 / 16 | 400 | slate-600 or slate-400 | Stat card labels, "Estimated" under ranges, timestamps, phone numbers under names, table headers (12/16, 500, slate-600), fine print |
| `pill` | 12 / 16 | 600 | per pill | All pills and badges |
| `overline` | 12 / 16 | 500 | slate-400 | Nav group label "Admin" |

**Where measured sizes fall between two steps, the larger was chosen for headings and the smaller for small text.** Body copy is never smaller than 12px.

### 4.3 Spacing

The drawing uses a 4px grid with these recurring values:

| Token | px | Where |
| --- | --- | --- |
| `space-1` | 4 | Gap between a label line and its sub-line |
| `space-2` | 8 | Icon-to-text gap; gap between pills and text; gap between small buttons in a table row |
| `space-2.5` | 10 | Gap between the two stacked landing buttons |
| `space-3` | 12 | Gap between a form label and its field; gap between a field and helper text; P1 stat tile gap |
| `space-4` | 16 | **Patient page side padding**; gap between patient cards; card padding on small cards |
| `space-5` | 20 | Top padding under the patient app bar; patient card inner padding |
| `space-6` | 24 | Hero card top and bottom padding; staff main-area top padding; staff card padding (20 on dense cards) |
| `space-7` | 28 | Staff main-area left and right padding |
| `space-8` | 32 | Gap between landing sections |

Staff grid: the main area is 1080px wide at the 1320px shell. Stat cards are 4 × 242px with 18px gaps. The two-column layouts (S7, S9, S10, S11, S12) use an 18px gap and a fractional split that varies slightly by screen (1.3 to 1.5 : 1); each blueprint in section 9 gives the exact split.

### 4.4 Radius

| Token | px | Where |
| --- | --- | --- |
| `radius-xs` | 5 | Checkbox |
| `radius-s` | 8 | Scale-option tiles (P13), small staff buttons (30 to 36px tall), table pills that are not fully round, segmented tab items |
| `radius-m` | 10 | All buttons 44px and taller; icon tiles (36 to 40px); info banners; slot buttons |
| `radius-l` | 12 | Inputs, selects, search fields; inner cards (demo phone card, message bubbles, list rows inside cards); segmented-tab container |
| `radius-xl` | 14 | **Cards** (patient and staff), modals |
| `radius-2xl` | 20 | Top corners of the bottom sheet (P12) |
| `radius-full` | 9999 | Pills, chips, avatars, toggles, dots |

### 4.5 Borders, elevation and focus

- **Border:** 1px `slate-200` on every card, input, outline button, table and divider. Dividers inside cards are inset to the card padding.
- **Elevation:** none. Cards are flat; no shadow is visible anywhere in the drawing. Modals and the bottom sheet sit on the overlay without a visible shadow. A shadow may be added for modals only: `0 20px 40px -12px rgba(15,23,42,0.25)` **(derived)**.
- **Focus (inputs):** border 1.5px `primary-600` plus a 3px ring in `primary-100` (P6 phone field, S5 search field).
- **Focus (buttons, links, chips, toggles):** 2px `primary-600` outline with a 2px offset **(derived)**. It must be visible on every control (WCAG 2.2 AA).

### 4.6 Logo mark

- A rounded square, 26px on patient screens (radius 7) and 24px in the staff sidebar (radius 6), filled with a 135° linear gradient from `#0B5AA8` (top left) to `#1EC997` (bottom right). Measured corners: `#0E6BA6`, `#1488A1`, `#189C9E`, `#1EBB9A`.
- On the dark S1 panel, use the lighter variant: `#378DE8` to `#24BEA4`.
- The wordmark "BabyBlue" sits 10px to the right: 16px/600 slate-900 on patient landings, 15px/700 in the staff sidebar, 14px/600 slate-600 on P5 (header), 16px/600 white on S1.
- The canvas notes call this a neutral stand-in until the final logo is chosen. Build it as an SVG component (`<BrandMark size=… variant="default|onDark" />`) so the final logo replaces it in one place.

### 4.7 Icons

Line icons, 1.75px stroke, rounded caps and joins, drawn at 16px (in text lines and table rows), 18px (buttons, nav) or 20 to 24px (icon tiles, app-bar actions). The glyphs match **Lucide** (`lucide-react`); use these names:

| Use | Lucide icon |
| --- | --- |
| Estimated wait, hours, "Mon–Fri" row, lunch block | `clock` |
| Waiting count, Join the queue button, Patients nav | `user` |
| Add walk-in button | `user-plus` |
| My profile nav | `circle-user` |
| Queue nav | `text` (three left-aligned lines; `align-left` is the same glyph) |
| Settings nav | `sun` (the drawn glyph is a small sun; if you prefer a cog, use `settings` and accept the visual difference) |
| Sign out | `log-out` |
| Address | `map-pin` |
| Phone | `phone` |
| By appointment, New booking, date fields, blocked day | `calendar` |
| Search | `search` |
| Back | `chevron-left` |
| Select menus | `chevron-down` |
| Refresh (app bar) | `rotate-cw` |
| Info banners | `info` |
| Warning banner (P8) | `info` in warning-700 |
| Offline banner | `wifi-off` (drawn as a struck-through signal) |
| Leave confirmation tile | `triangle-alert` |
| Intake row, message note (P15) | `file-text` |
| WhatsApp (row, preview header) | `message-circle` |
| SMS | `mail` |
| In consultation | `stethoscope` |
| Done, intake submitted | `circle-check` |
| Cancelled | `circle-x` |
| Checkmarks (recognised banner, consent ok, stepper) | `check` |
| Show password | `eye` |
| Close modal | `x` |
| Drag handle | `grip-vertical` |
| Add | `plus` |
| Question types: multiple choice, scale, yes/no, free text | `list-todo`, `arrow-right-to-line`, `check`, `align-left` |
| Stars | `star` (filled `warning-500`, empty outline `slate-300`) |
| FAQ expand | `plus` (16px, slate-400) |

### 4.8 Tailwind theme (paste into `tailwind.config.ts`)

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["var(--font-inter)", "system-ui", "sans-serif"] },
      colors: {
        primary: { 25: "#F9FBFF", 50: "#EFF6FF", 100: "#DFE8F3", 200: "#C9DBF0", 300: "#BACFEA",
                   600: "#0B5AA8", 700: "#094A8B", 900: "#073E78", DEFAULT: "#0B5AA8" },
        accent:  { 50: "#ECFDF5", 200: "#B9EED9", 500: "#1EC997", 600: "#0DAE7B", DEFAULT: "#1EC997" },
        warning: { 50: "#FFF6E8", 300: "#FCD8A6", 500: "#F59E0B", 700: "#B4550B", 800: "#854D0E", DEFAULT: "#F59E0B" },
        error:   { 50: "#FEF2F2", 200: "#FECACA", 500: "#EF4444", 600: "#DC2626", DEFAULT: "#EF4444" },
        // slate is Tailwind's default palette (50 #F8FAFC … 900 #0F172A); keep it.
      },
      fontSize: {
        "display":     ["56px", { lineHeight: "56px", letterSpacing: "-0.02em", fontWeight: "800" }],
        "display-sm":  ["42px", { lineHeight: "44px", letterSpacing: "-0.02em", fontWeight: "800" }],
        "h1-landing":  ["26px", { lineHeight: "32px", letterSpacing: "-0.01em", fontWeight: "700" }],
        "stat-xl":     ["26px", { lineHeight: "30px", fontWeight: "700" }],
        "stat-l":      ["28px", { lineHeight: "32px", fontWeight: "700" }],
        "h1-staff":    ["24px", { lineHeight: "32px", letterSpacing: "-0.01em", fontWeight: "700" }],
        "estimate-l":  ["24px", { lineHeight: "30px", fontWeight: "700" }],
        "estimate-m":  ["22px", { lineHeight: "28px", fontWeight: "700" }],
        "h1-page":     ["22px", { lineHeight: "28px", letterSpacing: "-0.01em", fontWeight: "700" }],
        "h1-compact":  ["20px", { lineHeight: "26px", letterSpacing: "-0.01em", fontWeight: "700" }],
        "h2":          ["18px", { lineHeight: "24px", fontWeight: "600" }],
        "appbar":      ["17px", { lineHeight: "22px", fontWeight: "600" }],
        "title-m":     ["16px", { lineHeight: "22px", fontWeight: "600" }],
        "title-s":     ["15px", { lineHeight: "20px", fontWeight: "600" }],
        "body-l":      ["15px", { lineHeight: "24px" }],
        "body":        ["14px", { lineHeight: "22px" }],
        "body-s":      ["13px", { lineHeight: "20px" }],
        "caption":     ["12px", { lineHeight: "16px" }],
      },
      borderRadius: { xs: "5px", s: "8px", m: "10px", l: "12px", xl: "14px", "2xl": "20px" },
      spacing: { 4.5: "18px", 7: "28px", 13: "52px", 14: "56px" },
    },
  },
} satisfies Config;
```

Use `bg-slate-50` for both app backgrounds, `border-slate-200` for every border, and `text-slate-900 / 600 / 400` for the three text levels. The overlay is `bg-[rgba(15,23,42,0.46)]`.

---

## 5. Component library

Build these once, in `src/components/ui`, and compose every screen from them. Sizes are in design px. "Patient" and "Staff" mark where a size differs by surface.

### 5.1 Buttons

| Variant | Height | Radius | Text | Fill / border | Drawn on |
| --- | --- | --- | --- | --- | --- |
| `primary-xl` (patient) | 56 | 10 | 16/500 white | `primary-600` | P6 "Join the queue", P13 "Submit intake", P10 "Send feedback" |
| `primary-l` (patient) | 52 | 10 | 15/500 white | `primary-600` | P1–P3 "Book a 15-minute walkthrough", P4 "Join the queue" (44 tall inside cards), P5 "Join the queue" (with `user` icon), P11 "Join the queue again", P12 "Keep my place" |
| `outline-primary-l` (patient) | 52 | 10 | 15/500 `primary-600` | white, 1px `primary-600` | P1 "See a live queue demo", P2 "See the standby list", P3 "Talk to us on WhatsApp", P4 "Request a booking" (44) |
| `outline-neutral` (patient) | 44 | 10 | 15/500 `primary-600` | white, 1px `slate-200` | P5 "Book a time instead", P8 "Try again now", P11 "Call reception · 011 447 2210" |
| `outline-destructive` (patient) | 52 | 10 | 15/500 `error-500` | white, 1px `error-200` | P12 "Yes, leave the queue" |
| `outline-primary-m` (patient, inline) | 48 | 12 | 15/500 `primary-600` | white, 1px `primary-600`, 24px side padding, hugs content | P14 "Back to my queue position" |
| `text-link` | auto | – | 14/500 `primary-600` (13/500 when inline) | none | "Start", "Open", "Open in Maps", "For clinics", "Add block", "Add note", "Change", "Change patient", "Select" |
| `text-quiet` | 44 | – | 15/400 `slate-600` | none | P7/P8 "Leave the queue" (centred at the bottom of the page) |
| `primary` (staff) | 44 | 10 | 14/500 white | `primary-600`, 16px side padding, optional 18px leading icon | "Add walk-in", "Add patient", "Add to today's queue", "Save changes", "Save note", "Save hours", "Create booking", "Add to queue", "Continue", "Sign in" (full width), "Call next" (header, S7) |
| `secondary` (staff) | 44 | 10 | 14/500 `slate-700` | white, 1px `slate-200` | "Discard", "Cancel", "Back", "Edit details", "Cancel visit" |
| `secondary-primary` (staff) | 44 | 10 | 14/500 `primary-600` | white, 1px `slate-200`, `calendar` icon | S4 "New booking" |
| `accent` (staff) | 44 | 10 | 14/500 white | `accent-500` | S3 "Go to queue" |
| `soft-primary` (table) | 30 | 8 | 13/500 `primary-600` | `primary-50` | S4 "Call" |
| `solid-primary-sm` (table) | 30 | 8 | 13/600 white | `primary-600` | S4 "Call next" on the first waiting row |
| `soft-neutral` (table) | 30 | 8 | 13/500 `slate-600` | `slate-100` | S4 "Cancel", "Open"; S11 "Edit"; S9 "Export file", "Withdraw consent" |
| `soft-accent` (table) | 30 | 8 | 13/500 `accent-600` | `accent-50` | S4 "Mark seen" |
| `primary-sm` (staff) | 32 | 8 | 13/500 white | `primary-600` | S11 "Save question" |
| `secondary-sm` (staff) | 32 | 8 | 13/500 `slate-700` | white, 1px `slate-200` | S11 "Cancel" |
| `text-destructive` | auto | – | 13/500 `error-500` | none | S11 "Delete question", S12 "Sign out" |

States (all buttons): hover darkens the fill one step (`primary-700`, `slate-200` for soft neutral, white to `slate-50` for outlines) **(derived)**; pressed adds `translateY(1px)` **(derived)**; disabled uses 50% opacity and `cursor: not-allowed` (drawn: the "Open" button on the Done row of S4, and the "Edit" button on an inactive S11 question); loading replaces the label with a 16px spinner and keeps the width. Every button keeps a 44 × 44px minimum touch area on touch screens. The 30px table buttons get that by padding their hit area.

### 5.2 Text inputs and selects

| Variant | Height | Radius | Padding | Text | Drawn on |
| --- | --- | --- | --- | --- | --- |
| `input-l` (patient) | 48 | 12 | 16 | 15/400 `slate-900`; placeholder `slate-400` | P6 names, phone, ID number; P4 search (with `search` icon at 16px left, text at 44px); P10 comment (textarea, 2 lines, 64 tall) |
| `input` (staff) | 48 | 12 | 16 | 14/400 `slate-900` | S1, S2, S3, S5, S6, S12 |
| `input-m` (staff) | 44 | 12 | 12 | 14/400 | S10 hours fields (120 wide each), S8 search (with icon) |
| `input-s` (staff) | 40 | 10 | 12 | 13/400 | S11 inline editor |
| `textarea` (staff) | 112 | 12 | 14 | 14/22 `slate-700` | S7 clinical note |

- Border 1px `slate-200`, fill white. Focus: 1.5px `primary-600` border plus a 3px `primary-100` ring (drawn on the P6 phone field and the S5 search field).
- Read-only or derived: `slate-50` fill, `slate-400` text (S5 "1989-04-12 · from the ID number"). Disabled: the same, with the label in `slate-400` (S10 Sunday "Closed").
- A select is the same box with a `chevron-down` (16px, `slate-500`) 16px from the right.
- A slug field (S2) shows the fixed prefix `bby.co.za/c/` in `slate-600` and the editable slug in `slate-900` weight 600, with an inline status at the right: "Available" (12/600 `accent-600`); "Taken" (12/600 `error-500`) **(derived)**.
- The password field (S1) has an `eye` toggle (18px, `slate-500`) 16px from the right.
- **Label:** above the field, 12px gap. Patient labels are 14/500 `slate-900`; staff labels are 13/500 (cards) or 14/500 (modals and auth). The required mark is a `error-500` asterisk with one space before it (S5). "(optional)" is 13/400 `slate-500` after the label (S3, S5).
- **Helper and validation text:** 12px gap below the field, 13/400. Valid: `accent-600` (S5 "Valid ID — date of birth 12/04/1989"). Error: `error-500` **(derived, same position)**. Hint: `slate-600` (S2 "Used for the first estimates until we've watched a few real days.").

### 5.3 Checkbox, toggle and choice controls

- **Checkbox:** 18 × 18, radius 5. Off: white, 1.5px `slate-300` border. On: `primary-600` fill with a white `check` (12px, stroke 2.5). The label is 13–14/400 `slate-600`, 10px to the right, aligned to the first line.
- **Toggle:** a 44 × 26 track with a 20px white knob and a 3px inset. On: `primary-600` track, knob at the right. Off: `slate-200` track (S12) or `slate-100` with a `slate-200` border on disabled rows (S10 Sunday, S11 inactive question), knob at the left. Animate over 150ms.
- **Segmented choice (urgency, S5):** three equal boxes, 48 tall, radius 10, 8px gaps. Unselected: white, 1px `slate-200`, 14/500 `slate-600`. Selected: `primary-50` fill, 1.5px `primary-600` border, 14/600 `primary-600`.
- **Scale picker (P13, S11 preview):** six tiles (0 to 5), 48 tall on patient screens (36 in the S11 preview), radius 8, 6px gaps, filling the width. Unselected: white, 1px `slate-200`, 15/400 `slate-600`. Selected: `primary-600` fill, white 15/600. Under the tiles: the end labels ("0 — none" left, "5 — severe" right), 12/400 `slate-600`, 8px gap.
- **Yes / No (P13):** two equal buttons, 48 tall, radius 10, 12px gap, white, 1px `slate-200`, 15/400 `slate-700`. Selected uses the scale's selected style.
- **Filter chip (P4):** 30 tall, pill radius, 12px side padding, 13/500. Off: white, 1px `slate-200`, `slate-600`. On: `primary-600` fill, white. 8px gaps.
- **Filter button (S8):** a staff `secondary` button (44 tall). When active **(derived)**: `primary-50` fill, `primary-600` text and border.
- **Segmented tabs (S4 filter, S10 settings):** a white container with a 1px `slate-200` border, radius 12 and 4px inner padding. The tabs inside are 32 tall, radius 8, with 14px side padding. Inactive: 13/500 `slate-600`, with a count in 13/400 `slate-400` after one space ("Waiting 6"). Active: `primary-600` fill, white text, count in white at 75% opacity ("All 17").
- **Time slot (S6):** a six-column grid with 8px gaps; slots are 40 tall, radius 8, 14/500. Available: white, 1px `slate-200`, `slate-900`. Selected: `primary-600` fill, white 14/700. Taken: white, 1px `slate-200`, `slate-300` text with a line-through. Blocked: `slate-50` fill, 1px `slate-200`, the text "Blocked" in 14/400 `slate-400`.
- **Stars (P10):** five 28px `star` icons with 12px gaps, centred. Filled: `warning-500`. Empty: 1.5px `slate-300` outline. The tap target is 44px.
- **Stepper (S2, S3):** a 22px circle and label, a 110px connector line (1px `slate-200`), then the second circle and label. Current: `primary-600` filled circle with a white number 12/600, label 14/600 `primary-600`. Upcoming: white circle with a 1px `slate-300` border, `slate-400` number and label (14/500). Done: `accent-50` circle with an `accent-600` `check` 12px, label 14/600 `accent-600`.

### 5.4 Cards and surfaces

- **Card:** white, 1px `slate-200`, radius 14, no shadow. Padding is 20 on patient cards, 16 on dense patient rows (P7 intake and messaging rows, P15 bubbles' container), and 20 (dense) or 24 on staff cards. Card title (staff): 16/600 `slate-900`, with an optional subtitle in 13/400 `slate-600` 4px below and an optional right-aligned `text-link`.
- **Inset panel:** `slate-50` fill, 1px `slate-200`, radius 14, padding 16 (P1 demo card, P2 "Today's chair", P3 "Three streams"), or `slate-50` with no border, radius 12 (P6 consent box). Inside, white sub-cards use radius 12.
- **List row inside a card (P5 contact block, S9 lists, S12 security):** a 16px vertical rhythm, divided by 1px `slate-200` lines inset to the card padding. Rows are icon (20px, `slate-600`) plus a main line (14/400 `slate-900`) plus a sub-line (13/400 `slate-600`) or link.
- **Key-value row (P9 "Your visit", S7 intake answers, S9 visit pattern):** label 14/400 `slate-600` on the left, value 14/600 `slate-900` on the right (or `accent-600` for "Submitted"); rows 40 tall with 1px dividers.
- **Info banner:** `primary-50` fill, radius 12, padding 16, an `info` icon (18px, `primary-600`) at the top left, and text in 14/22 `slate-900` (patient) or 13/20 `slate-900` (staff) 12px to the right of the icon. A bordered variant (1px `primary-200`) is used on P6 and S3.
- **Warning banner (P8):** `warning-50` fill, radius 12, padding 16, an `info` icon in `warning-700`, and text in 14/22 `warning-800`.
- **Offline strip (P8):** full width under the status bar, 34 tall, `warning-50` fill with a 1px `warning-300` bottom border, a `wifi-off` icon (16px) and "Offline — reconnecting…" in 13/500 `warning-700`, 16px left padding.

### 5.5 App bars and shells

**Patient app bar** (status, intake and message screens): white, 64 tall below the safe-area inset, with a 1px `slate-200` bottom border and 16px side padding.

- On status screens (P7 to P11): an overline "Your visit at" (12/400 `slate-600`) above the practice name (16/600 `slate-900`), and a `rotate-cw` refresh button (22px icon, `slate-600`, 44px target) on the right. P10 and P11 have no refresh button.
- On task screens (P6, P13, P15): a `chevron-left` back button (22px, `slate-700`, 44px target) at the left edge and the title in 17/600, 8px from the icon. P13 adds a step counter at the right ("3 of 4", 12/400 `slate-600`) and a progress bar 12px below the title: a 6px track in `slate-200`, pill radius, with a `primary-600` fill at answered/total (3 of 4 = 75%). P14 shows only the title, with no back button.

**Patient landing header** (P1 to P3): no border; the 26px mark and "BabyBlue" at the left, and "For clinics" (14/500 `primary-600`) at the right, 20px below the safe area.

**Patient page:** `slate-50` background; content padding of 20 top, 16 sides and 32 bottom; 16px between cards. On P5 the header block (logo, name, practitioners, open status) is white, ends with a 1px `slate-200` border and has 24px below it.

**Staff shell:**

- **Sidebar:** 240 wide, full height, white, with a 1px `slate-200` right border.
  - Brand block: 20px padding, the mark (24px) and "BabyBlue" (15/700 `slate-900`), and below it, 8px down, the practice name in 12/400 `slate-600`. The block is 80 tall and closes with a 1px `slate-200` divider.
  - Nav: 12px padding. Items are 44 tall, radius 10, 6px apart, with 12px side padding, an 18px icon and the label 12px to its right, in 15/500 `slate-600`. Active: `primary-600` fill, white icon and label. Hover: `slate-50` fill **(derived)**. Order: Queue, Patients, My profile. Then a group label "Admin" (12/500 `slate-400`, 16px top margin, 12px left inset) and Settings, shown to Admins only.
  - Footer, pinned to the bottom: a 1px `slate-200` divider, then 20px padding, the signed-in name (14/600 `slate-900`), the role (12/400 `slate-600`), a 16px gap and a "Sign out" nav-style item with `log-out`.
- **Main area:** `slate-50` background; padding of 24 top, 28 sides and 32 bottom; the content column fills the width up to 1200px.
- **Page header:** title in 24/32 700 with the subtitle 4px below it (13/400 `slate-600`); header actions are right-aligned at the title's top, 12px apart. Optional breadcrumb above the title: `chevron-left` 16px plus a label in 13/400 `slate-600` ("Today's queue", "Patients", "Settings"), 12px above the title.

### 5.6 Pills, badges, avatars and dots

**Pill:** pill radius, 12/600. On staff and inline it is 20 tall with 8px side padding; patient hero pills are 24 tall with 12px padding and 13/600 text.

| Pill | Text | Fill | Where |
| --- | --- | --- | --- |
| Waiting | `slate-700` | `slate-100` | P1, P7, P8, P12; "Waiting · #3" (S9), "Waiting · #1" (S7) |
| In consultation | `primary-600` | `primary-50` (white on the P9 card) | S4, P9 |
| Done | `accent-600` | `accent-50` (white on the P10 card) | S4, S9, P10 |
| Cancelled | `slate-600` | `slate-100` | P11, S9 |
| Routine | `slate-600` | `slate-100` | S4 |
| Soon | `warning-700` | `warning-50` | S4 |
| Urgent | `error-600` | `error-50` | S4 |
| Needs review **(new, A4)** | `warning-700` | `warning-50`, 1px `warning-300` | S4, S7 |
| ID missing **(new, A3)** | `warning-700` | `warning-50` | S4 (after the phone), S7, S9 |
| Open (clinic) | `accent-600` | `accent-50` | P4 |
| Closed (clinic) | `slate-500` | `slate-100` | P4 |
| Confirmed (slot) | `accent-600` | none (text only) | P2 |
| Open (standby slot) | `warning-700` | none (text only) | P2 |
| Given / Not given | `accent-600` on `accent-50` / `slate-600` on `slate-100` | | S8 |
| Primary / Fallback | `accent-600` on `accent-50` / `slate-600` on `slate-100` | | P15 |
| Question type: Multiple choice, Scale, Yes / no | `primary-600` | `primary-50` | S11 (inactive: `slate-400` on `slate-100`) |
| Landing tag: General practice, Small clinic | `primary-600` | `primary-50` | P1, P3 |
| Landing tag: Dental practice | `accent-600` | `accent-50` | P2 |
| Role: Admin | `primary-600` | `primary-50` | S12 |
| Pending / Approved / Declined **(new)** | `warning-700` / `accent-600` / `error-600` on the matching 50 fill | | S13, pending screen |

- **Avatar:** a circle with initials (`primary-50` fill, `primary-600` text 600). Sizes: 32 (table, S8; the first row's avatar is `primary-50`, other rows use `slate-100` with `slate-600` initials), 36 (S6 patient card, filled `primary-600` with white initials), 40 (S7 and S9 headers, 15/600), 56 (S12, 18/600).
- **Live dot:** 8px circle, `accent-500`, followed by 12/400 `slate-600` text ("Updated just now", "Live · updated just now"). When stale (no update for 30s) **(derived)**: `warning-500` dot and the text "Reconnecting…".
- **Status dot (P5):** 8px `accent-500` before "Open now — closes 17:00".
- **Timeline dot (S7):** 8px. Done step: `primary-600`. Message delivered: `accent-500`. Pending: white with a 1.5px `slate-300` ring, and the label in `slate-400`.

### 5.7 Modal and bottom sheet

- **Modal (staff):** centred, top-aligned 40px from the top of the viewport, white, radius 14, over the overlay. Widths: 560 (S5 Add walk-in), 640 (S6 New booking), 480 (urgent review dialog, 10.3).
  - Header: 24px padding; title 20/700 `slate-900`; subtitle 4px below (13/400 `slate-600`); a close button (`x`, 20px, `slate-500`, 36px target) at the top right; a 1px `slate-200` divider below.
  - Body: 24px padding; fields in a two-column grid with 16px column gaps and 16px row gaps.
  - Footer: `slate-50` fill, a 1px `slate-200` top border, 16 × 24px padding, buttons right-aligned 12px apart, and an optional summary at the left (13/400 `slate-600`, S6 "Wed 15 Oct, 08:45 with Dr N. Mokoena").
  - Behaviour: Escape closes; focus is trapped; focus returns to the trigger.
- **Bottom sheet (patient):** full width, top radius 20, white, 20px padding plus the safe area, over the overlay. Drawn content (P12): a 44 × 44 tile (radius 12, `error-50`, `triangle-alert` 20px `error-500`), the title 20/700 16px below, the body 15/24 `slate-600` 8px below, then the buttons stacked (primary-l, 10px gap, outline-destructive). Default focus goes on the safe action.

### 5.8 Tables (staff)

- A white card with no inner padding.
- Header row: 36 tall, 12/500 `slate-600`, white, with a 1px bottom border.
- Body rows: 58 tall, 16px cell padding at the left and right edges, with 1px `slate-200` dividers.
- Cell text: names 14/600 `slate-900` with the phone below (12/400 `slate-600`, tabular). Other cells are 14/400 `slate-600`. Wrap to two lines rather than truncating (S4 "Blood pressure check").
- Row states: the in-consultation row uses a `primary-25` fill. Done rows render every cell at 60% opacity with a disabled "Open". Hover: `slate-50` **(derived)**. The whole row is clickable to open the visit; the action buttons stop propagation.

### 5.9 Estimate component (EstimateRange)

One component, three placements, the same wording everywhere. Props: `minMinutes`, `maxMinutes`, `position`, `lastConfirmedAt`, `variant` (`hero`, `row`, `inline`, `detail`).

| Variant | Drawn as |
| --- | --- |
| `hero` (P7, P8) | A `clock` icon (18px) plus "Estimated wait" (14/400 `slate-600`) centred; the value below in 22/700 ("20–35 min"); the basis line below in 13/400 `slate-600` ("Based on today's pace at this practice"). Offline: the value turns `slate-600` and the basis line becomes "Last confirmed N minutes ago" in `warning-700` |
| `row` (S4 table) | The value in 14/600 `slate-900` ("10–20 min"), with "Estimated" below in 12/400 `slate-600` |
| `inline` (P1 demo, P4 card) | A `clock` icon plus "Estimated " in 14/400 `slate-600` and the range in 14/600 `slate-900` ("Estimated **20–35 min**") |
| `detail` (S7) | A small header (`clock` 16px plus "Estimated wait for this patient", 12/400 `slate-600`), the value in 24/700, and the note "Their phone shows the same figure, with the same label." (12/400 `slate-600`) |
| `stat` (P5, S4) | P5: "Estimated wait" label (13/400) with "20–35" in 26/700 and " min" in 14/400. S4: "Estimated median wait" with `clock`, "24" in 28/700 and " min" in 16/400 `slate-600` |

Rules: always a range written with an en dash and no spaces ("20–35 min"). At position 1, show "Under 10 min". Never show a single figure.

---

## 6. Architecture and stack

A Next.js PWA frontend and an ASP.NET Core backend on PostgreSQL, with SignalR for realtime.

### 6.1 Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend | Next.js (App Router, TypeScript), Tailwind with the theme in 4.8, Radix primitives for dialog, select, toggle, tabs and popover, `lucide-react` icons, `next/font` Inter | The PWA has a web manifest and a service worker for the patient app shell and the offline banner. Joining must work without installing. |
| Backend | ASP.NET Core, controller-based (MVC structure), JSON API under `/api` | Layers: Controllers → Services → Repositories (Npgsql or Dapper) → DTOs. Next.js owns the UI; no Razor views. |
| Database | **PostgreSQL 15+** | Schema, constraints and every query are defined in `BabyBlue-Database-Implementation-Spec.md`. Repositories call only its `fn_*` functions and `sp_*` procedures. |
| Tenant isolation | Composite foreign keys and in-routine checks (`_assert_staff`) in the database, plus the practice id taken from the session (never from the request body) | Replaces the EF Core global filter of v2. |
| Realtime | SignalR, with one group per practice queue and one per visit | Long-polling fallback; the client also polls every 15 seconds when the connection drops. |
| Background jobs | Hangfire or a hosted service | The outbox worker, reminders, nightly clean-up and monthly invoices, as scheduled in the database spec (section 10 there). |
| Staff auth | ASP.NET Core Identity, a cookie session, email verification, optional TOTP for Admins | Next.js and the API share a parent domain so the cookie is first-party. |
| Patient auth | None. A visit token in the URL | 128-bit random; only its SHA-256 hash is stored. |
| Email | SendGrid | Verification, password reset, practice approved and declined, daily summary. |
| WhatsApp and SMS | A separate provider (11.3) | Not SendGrid. |
| Hosting | Azure South Africa North | Health data stays in South Africa where possible. |

### 6.2 Route map

| Route | Screens | Access |
| --- | --- | --- |
| `/` | P1 | Public |
| `/for-clinics/dental`, `/for-clinics/clinic` | P2, P3 (flag B2) | Public |
| `/clinics` | P4 | Public |
| `/c/[slug]` | P5 | Public |
| `/c/[slug]/join` | P6 | Public, practice approved and open |
| `/q/[token]` | P7 to P12 (one page; the state decides the view) | Visit token |
| `/q/[token]/intake` | P13, P14 | Visit token |
| `/q/[token]/messages` | P15 | Visit token |
| `/staff/sign-in`, `/staff/sign-up` | S1 | Public |
| `/staff/onboarding` | S2, S3 | Staff, practice draft or declined |
| `/staff/pending` | 10.5 | Staff, practice pending or declined |
| `/staff/queue` | S4, with S5, S6 and the 10.3 dialog as modal routes (`?modal=walk-in`) | Staff, practice approved |
| `/staff/visits/[id]` | S7 | Staff |
| `/staff/patients`, `/staff/patients/[id]` | S8, S9 | Staff (role-gated) |
| `/staff/settings/[tab]` | S10 tabs and S11 (`hours`, `blocked`, `intake`, `practice`, `staff`) | Admin |
| `/staff/profile` | S12 | Staff |
| `/platform/practices`, `/platform/practices/[id]` | S13 | Platform admin |

### 6.3 Frontend structure

```
src/
  app/                      # routes from 6.2
  components/
    ui/                     # section 5: Button, Input, Select, Checkbox, Toggle, Segmented, ScalePicker,
                            # Chip, Tabs, Slot, Stars, Stepper, Card, InsetPanel, Banner, Pill, Avatar,
                            # LiveDot, Modal, BottomSheet, Table, Skeleton, Toast, BrandMark
    patient/                # AppBar, StatusHero, EstimateRange, IntakeQuestion, MessageBubble, ...
    staff/                  # Shell, Sidebar, PageHeader, StatCard, QueueTable, VisitTimeline, ...
  styles/globals.css        # Inter variable, base colours, focus ring
  lib/api.ts                # typed calls to /api
  lib/realtime.ts           # SignalR client with polling fallback
```

Rules: screens use only `components/ui` and the tokens; no hex values or arbitrary sizes in screen files. Add a lint rule (`no-restricted-syntax` on `#[0-9a-f]{6}` in `app/**`) to keep it that way.

### 6.4 Data flow

Staff actions (Call, Mark seen, Cancel, Add walk-in) go to API endpoints. Each endpoint calls one stored procedure, which writes the visit and enqueues any messages in the same transaction; the endpoint then broadcasts over SignalR. Patient clients subscribe only to their own visit and the practice summary. If the socket drops, the client polls every 15 seconds and shows P8 after two failed polls. Mutations carry an idempotency key, so a double tap on Call cannot call two patients.

### 6.5 Visual QA: how to prove the build matches

1. **Canvas fixture seed:** a script that creates "Rosebank Family Practice" with exactly the people, times and numbers drawn on each frame. Because the frames disagree with each other (C3), the seed loads one fixture per frame (`?fixture=P7`, `?fixture=S4`, …) in non-production builds only. The clock is frozen at the drawn times (09:41 for patient frames; 14 October 2026 for staff frames).
2. **Reference images:** capture each canvas frame once at 1× (402 or 1320 wide) and commit them to `tests/visual/reference/`. This is the one time the canvas is needed; after that, this spec and the images are the source of truth.
3. **Playwright screenshot tests:** render each route with its fixture at the same viewport and compare it with the reference using `toHaveScreenshot({ maxDiffPixelRatio: 0.02 })`. A failure shows the diff image.
4. **Token test:** a unit test renders each `ui` component and asserts its computed height, radius, font size and colours against section 5.

### 6.6 Environments

Local, a preview per pull request, and production. The demo practice seed (with consistent data, not the per-frame fixtures) runs in local and preview.

---

## 7. Data model and visit rules

The tables, constraints and stored routines are defined in the database spec, which supersedes the entity list in v2 of this document. The rules the UI depends on are summarised here.

### 7.1 Visit status transitions

| From | To | Actor | Patient screen | Side effects |
| --- | --- | --- | --- | --- |
| (none) | waiting | Patient (P6) or reception (S5) | P7 | Position assigned; confirmation message queued |
| booked | waiting | Reception check-in | P7 | Joins at arrival time |
| waiting | in_consultation | Staff Call or Call next | P9 | "Ready for you" message with the room |
| in_consultation | done | Staff Mark seen | P10 | ID gate (7.5); consult end recorded |
| waiting | cancelled | Patient (P12) | P11 variant | Everyone behind moves up; no message |
| waiting | cancelled | Staff Cancel | P11 | Message sent; the token stays valid so P11 shows |
| waiting | no_show | Staff, or the nightly job | P11 variant | Counts as a missed appointment on S9 |

When a visit leaves waiting, later positions move up and every estimate recomputes within a second.

### 7.2 Position and estimate

Both are derived on the server (`fn_queue_snapshot`) and are never stored, so every screen and message shows the same numbers. The engine is described in 11.1.

### 7.3 Role matrix (confirm with the pilot practice)

| Capability | Platform admin | Practice admin | Reception | Clinician |
| --- | --- | --- | --- | --- |
| Approve or decline practices | Yes | No | No | No |
| View and operate the queue | No | Yes | Yes | Yes |
| Add walk-in, create booking | No | Yes | Yes | No |
| Call patient, mark seen | No | Yes | Yes | Yes |
| Flag a visit Urgent | No | Yes | Yes | Yes |
| Approve or decline an urgent move-up | No | Yes | No | No |
| Read and write clinical notes | No | Yes | No | Yes |
| View patient file | No | Yes | View only | View only |
| Export file, withdraw consent, reveal ID | No | Yes | No | No |
| Settings, staff, intake builder, QR | No | Yes | No | No |

The UI hides what a role cannot do; the database refuses it regardless (`_assert_staff`).

### 7.4 Urgent flag and admin review (decision 2)

1. Staff set urgency to Urgent on S5 or S7. The visit gets the "Needs review" pill and the S4 banner (10.2). The queue order does not change, and the patient never sees the urgency.
2. An Admin opens the review dialog (10.3) and chooses Approve or Decline. A reason is required either way.
3. Approve moves the visit to the front of the waiting list and recalculates every estimate. Decline keeps its place.
4. Every decision is stored (`urgency_review`) and appears in the S7 timeline.
5. The emergency line (A6) stays on P5 and P6: a software queue is not an emergency service.

### 7.5 ID rule (decision 3)

ID is required before billing, not before queueing.

- **S5:** ID type and number are required, as drawn. Passport and other ID types are allowed for non-citizens.
- **P6:** ID is optional, as drawn. The visit shows "ID missing" on S4 and S7 until reception captures it.
- **Mark seen:** if the ID is still missing, the button opens a small dialog: "Add the ID number to continue." with an ID field, or, for Admins only, "Continue without ID" plus a required reason (audited).
- **On screen:** state the purpose wherever an ID is asked for: "Used for billing and your medical aid claim."
- **Storage:** ID numbers are encrypted, masked by default (S9) and audited when revealed.

### 7.6 Minors and dependants (decision 5)

The UI is specified in 10.1. Messages go to the guardian's number. Consent is given by the guardian and is recorded against them. Clinical notes attach to the patient.

---

## 8. Patient screens, frame by frame (P1 to P15)

**Frame:** 402 × 874 (iPhone 16 class) with the safe area at the top. Everything in quotation marks is verbatim copy from the canvas. Demo data shown ("Rosebank Family Practice", "Thabo Dlamini", "082 431 9087") comes from the canvas fixture seed (6.5). Positions are top to bottom; "→" means "then, below it".

Common to all patient screens: the `slate-50` page, 16px side padding, and Inter. The page title (`<title>`) is the practice name when one is known, otherwise "BabyBlue".

### 8.1 P1 Landing, general practice (`/`)

The page scrolls; the frame shows the top, and the rest was read by scrolling inside it. The background is **white** on landing pages (not slate-50), with 16px side padding (`px-4`; content width 370).

1. **Header row** (20px below the safe area): the mark (26) and "BabyBlue" (16/600) at the left; "For clinics" (14/500 `primary-600`) at the right.
2. → 20px → **Tag pill** "General practice" (`primary-50` / `primary-600`, 22 tall, 12/600, 10px padding).
3. → 16px → **H1** "Stop making patients sit in a waiting room to hold their place." (26/32 700, `slate-900`, max width 300 so it breaks after "sit" and "hold").
4. → 12px → **Lead** "Patients scan a code, join the queue from their phone, and get a WhatsApp or SMS when it's nearly their turn. Your front desk keeps one live list." (15/24 `slate-600`).
5. → 20px → `primary-l` "Book a 15-minute walkthrough" (full width) → 10px → `outline-primary-l` "See a live queue demo".
6. → 28px → **Demo card** (inset panel, padding 16). The label "A patient's phone, right now" (13/600 `slate-600`) → 12px → a white sub-card (radius 12, 1px `slate-200`, padding 20 top and 16 bottom, centred content) containing:
   - the "Waiting" pill;
   - → 10px → "#3" (42/44 800);
   - → 2px → "in line" (14/400 `slate-600`);
   - → 14px → a 1px divider inset 16px;
   - → 12px → the `inline` estimate "Estimated **20–35 min**".
7. → 16px → **Stat tiles** (two equal columns, 12px gap; white cards, radius 14, padding 16). Each tile has a value in 22/700 `primary-600` ("31%", "4 min") and a label 4px below in 13/18 `slate-600` ("fewer people in the waiting room at peak", "to set up your practice and print a code"). **Hidden until measured values exist (B1).**
8. → 32px → **H2** "How it works" (18/600) → 16px → three steps, 20px apart. Each step has a 26 × 26 number tile (radius 8, `primary-50`, the number 13/600 `primary-600`), then 14px to the right a title (15/600 `slate-900`) and the description 2px below (14/22 `slate-600`):
   - "1" "Print the code, stick it at reception" / "One QR per practice. No app for anyone to install."
   - "2" "Patients join with a name and number" / "Optional short intake so the doctor reads before the door opens."
   - "3" "Reception calls the next person" / "Everyone's phone updates in the same second."
9. → 28px → **POPIA card** (white, 1px border, radius 14, padding 16): "Patient details are processed under POPIA. We keep a name, a contact number and an ID number only where a patient consents to record storage — and only for the practice they visit." (14/22 `slate-600`) → 10px → "Read our POPIA position" (14/500 `primary-600` link).
10. 32px bottom padding.

Behaviour: "Book a 15-minute walkthrough" opens the lead form (`sp_lead_create`); "See a live queue demo" opens a read-only demo of P7 with fixture data labelled "Demo"; "For clinics" goes to the staff sign-up (S1).

### 8.2 P2 Landing, dentist (`/for-clinics/dental`, behind flag B2)

The same header and structure as P1, with these differences:

1. The tag pill is "Dental practice" in accent (`accent-50` / `accent-600`).
2. **H1** "Booked chairs, filled gaps, fewer no-shows." (26/32 700).
3. **Lead** "Dentistry runs on the diary, not the door. BabyBlue confirms by WhatsApp, keeps a live standby list, and offers the next cancellation to the person most likely to take it."
4. Buttons: "Book a 15-minute walkthrough" / "See the standby list".
5. → 28px → **"Today's chair" panel** (inset panel, padding 16): label "Today's chair, 14 October" (13/600 `slate-600`) → 12px → three rows, 8px apart. Each row is a white card (radius 12, 1px `slate-200`, 44 tall, 12px side padding) with the time in 13/600 tabular `slate-600` (56 wide), the text in 14/400 `slate-900`, and the status at the right (12/600):
   - "09:00" "Scale and polish · L. Mokoena" "Confirmed" (`accent-600`)
   - "09:40" "Cancelled — offered to 3 on standby" (text `slate-600`, wraps to two lines) "Open" (`warning-700`). This row has a **1px dashed `warning-500` border at 60% opacity** and no white fill change.
   - "10:20" "Filling · S. Khumalo" "Confirmed"
6. → 32px → H2 "Built for a dental diary" → 16px → three feature cards (white, 1px border, radius 14, padding 16, 10px apart). Each card has a title (15/600) and a description 4px below (13/20 `slate-600`):
   - "Standby list" / "A cancellation goes out to the standby list in order, not as a scramble of phone calls."
   - "Procedure-length slots" / "Set an average duration per procedure type; estimates follow it."
   - "Reminders that get read" / "WhatsApp first, SMS if the number isn't on WhatsApp."

### 8.3 P3 Landing, small clinic (`/for-clinics/clinic`, behind flag B2)

The same shell as P1:

1. The tag pill is "Small clinic" (primary).
2. **H1** "One queue, several rooms, no shouting down the corridor."
3. **Lead** "Nurses, GPs and a treatment room can share one live list or split it. Everyone on shift sees the same order."
4. Buttons: "Book a 15-minute walkthrough" / "Talk to us on WhatsApp" (opens `https://wa.me/<sales number>`).
5. → 28px → **"Three streams, one order"** inset panel: the label (13/600 `slate-600`) → 12px → three equal white tiles (radius 12, 1px border, 64 tall, 10px gaps), each with a centred count (20/700 `slate-900`) over a caption (12/400 `slate-600`): "7" "Nurse", "4" "GP", "2" "Dressings".
6. → 32px → H2 "Common questions" → 12px → **accordion**, four rows. Each row is 48 tall with the question in 15/500 `slate-900`, a `plus` icon (16px `slate-400`) at the right, and 1px `slate-200` dividers between rows (no outer border):
   - "Does a patient need data to join?"
   - "What happens if the internet drops?"
   - "Where is patient data stored?"
   - "Can we keep paper files too?"

   The answers are not drawn. Expanded state **(derived)**: the `plus` rotates 45°, and the answer shows in 14/22 `slate-600` with 12px bottom padding. Answer copy is to be written by the owner (section 15).

### 8.4 P4 Find a clinic (`/clinics`)

1. **Header block** (white, a 1px bottom border, padding 16 sides and 16 bottom): the title "Find a clinic" (20/26 700) 12px below the safe area → 12px → a search field (`input-l` with a `search` icon; the value shown is "Rosebank") → 12px → chips: "All" (on), "GP", "Dentist", "Open now".
2. **Results** (16px top padding): the summary "4 practices near Rosebank, Johannesburg" (13/400 `slate-600`) → 12px → cards, 12px apart. Each card is white, 1px border, radius 14, padding 16:
   - a name (15/600 `slate-900`) with the status pill top-right ("Open" accent, or "Closed" neutral) → 2px → meta (13/400 `slate-600`: "General practice · 1.2 km · Cradock Ave") → 12px → a 1px divider → 12px → an info line (13/400 `slate-600`, 16px icons, 16px between items) → 12px → the action.
   - **Open, queue practice:** "Rosebank Family Practice". Info line: `clock` "Estimated **20–35 min**" and `user` "6 waiting". Action: `primary-l` at 44 tall, "Join the queue".
   - **Open, appointment practice:** "Parktown North Dental", "Dentist · 2.4 km · 3rd Ave". Info line: `calendar` "By appointment". Action: `outline-primary-l` at 44, "Request a booking" (B3).
   - **Closed:** "Melville Community Clinic", "Clinic · 4.1 km · Main Rd", info "Opens tomorrow at 07:30"; "Killarney Medical Centre", "General practice · 5.6 km", "Opens tomorrow at 08:00". On closed cards the **name and meta are `slate-600`** (muted), there is no action, and the info line is 13/400 `slate-500`.
3. Empty state **(derived)**: an inset panel with the text "No practices match. Try another area, or call your practice directly." Location permission: not requested until the user taps the search field's location action **(derived)**. Distances are blank without location.

### 8.5 P5 Clinic page (`/c/[slug]`)

1. **White header block** (padding 16 sides, 20 bottom; 1px bottom border):
   - the mark (26) + "BabyBlue" (14/600 `slate-600`);
   - → 16px → the clinic name (22/28 700) "Rosebank Family Practice";
   - → 4px → the practitioners on shift (14/400 `slate-600`) "Dr N. Mokoena · Dr A. Petersen";
   - → 12px → the status line: an 8px `accent-500` dot + "Open now — closes 17:00" (14/500 `accent-600`).
2. → 24px → **Queue card** (padding 20):
   - Two columns split by a 1px vertical divider (16px from each column):
     - Left: "In the queue" (13/400 `slate-600`) → 4px → "6" (26/700).
     - Right: "Estimated wait" → "20–35" (26/700) + " min" (14/400 `slate-600`).
   - → 12px → "Estimated from today's pace at this practice. It moves as the day moves — it isn't a booked time." (13/20 `slate-600`).
   - → 16px → `primary-l` with a `user` icon: "Join the queue".
   - → 10px → `outline-neutral` "Book a time instead" (B3).
3. → 12px → **Contact card** (padding 0 16), three rows separated by dividers, each 16px vertical padding, with a 20px `slate-600` icon and the text 12px to its right:
   - `map-pin`: "18 Cradock Avenue, Rosebank" (15/400 `slate-900`) → 2px → "Open in Maps" (14/500 `primary-600`, opens Google Maps with the coordinates).
   - `phone`: "011 447 2210" → "Reception, 07:30–17:00" (13/400 `slate-600`).
   - `clock`: "Mon–Fri 07:30–17:00" → "Sat 08:00–12:00 · Closed Sunday".
4. → 12px → **Info banner** (no border): "You can leave the building once you've joined. We'll message you on WhatsApp or SMS when you're two away."
5. → 12px → emergency line (A6).
6. **Closed state** **(derived from rules)**: the status line becomes a `slate-400` dot + "Closed — opens tomorrow at 07:30" (`slate-600`); the queue card keeps its layout but the Join button is replaced by a disabled `primary-l` reading "Opens tomorrow at 07:30"; "Book a time instead" stays.

### 8.6 P6 Join the queue (`/c/[slug]/join`)

1. **App bar** (task variant): back + "Join the queue".
2. → 16px → **Recognised banner** (bordered info banner with a `check` icon in `primary-600` instead of `info`): "We recognised these details from this device. Nothing is stored until you join." (14/22 `slate-900`) → 8px → "Not you? Clear and start fresh" (14/600 `primary-600`). Only shown when local storage holds details (B4).
3. → 12px → **Form card** (padding 16):
   - **New, A2:** before the names, a "Who is this visit for?" control (10.1).
   - Row: "First name" / "Last name" (two `input-l` fields, 10px gap; values "Thabo", "Dlamini").
   - → 14px → "Phone number" (`input-l`, shown focused, value "082 431 9087", tabular).
   - → 12px → the checkbox (on) "This is my WhatsApp number".
   - → 16px → a 1px divider → 16px → the heading line "**Identification** — optional for a walk-in" (14/600 `slate-900` + 14/400 `slate-600`).
   - → 12px → row: "ID type" (select "RSA ID") / "ID number" (placeholder "13 digits").
   - → 16px → **Consent box** (`slate-50`, radius 12, padding 14): the checkbox (off) + "I agree that Rosebank Family Practice may store my visit records so my care team can see my history on future visits. I can withdraw this at any time." (13/20 `slate-600`), with "POPIA notice" at the right in 13/600 `primary-600` (two lines, top-aligned).
   - → 16px → `primary-xl` "Join the queue".
   - → 14px → the footnote "Your details are used to manage this visit only. We don't share them with anyone outside the practice." (12/18 `slate-600`, centred).
4. Validation: names required; phone required (SA mobile, displayed as "0xx xxx xxxx"); ID number validated only when entered (RSA ID checksum, 13 digits). The ID helper text "Used for billing and your medical aid claim." appears under the ID row when the ID field has focus (7.5).

### 8.7 P7 Live status, waiting (`/q/[token]`)

1. **App bar** (status variant): "Your visit at" / "Rosebank Family Practice" + refresh.
2. → 20px → **Hero card** (padding 24 top, 24 bottom, centred):
   - the "Waiting" pill (24 tall);
   - → 16px → "#3" (`display`);
   - → 6px → "in line" (15/400 `slate-600`);
   - → 20px → a 1px divider inset 24px;
   - → 16px → the `hero` estimate: "Estimated wait" / "20–35 min" / "Based on today's pace at this practice".
3. → 16px → **Intake row card** (padding 16, 74 tall): a 40px icon tile (radius 10, `primary-50`, `file-text` 20px `primary-600`) → 12px → "Complete quick intake" (15/600) over "Four questions, helps the doctor prepare" (13/400 `slate-600`) → "Start" right-aligned (14/600 `primary-600`).
4. → 16px → **Messaging row card**: a tile (`accent-50`, `message-circle` `accent-600`) → "We'll message you when you're two away" over "WhatsApp to 082 431 9087, SMS if it fails". No action.
5. → 20px → the live dot + "Updated just now", centred.
6. Pinned to the bottom (32px above the home indicator): `text-quiet` "Leave the queue" → opens P12.
7. After intake is submitted, the intake row becomes **(derived)**: tile `accent-50` with `circle-check`, "Quick intake submitted", "Reception and the doctor can see your answers", and no action.

### 8.8 P8 Waiting, offline

The same as P7 with these changes (shown at position 1):

1. The offline strip (5.4) sits between the status bar and the app bar.
2. The hero number is "#1" in `slate-600`; the caption is "You're next in line" (15/600 `slate-900`); the estimate value is "Under 10 min" in `slate-600`; the basis line is "Last confirmed 3 minutes ago" (13/400 `warning-700`).
3. → 16px → **Warning banner**: "We can't reach the practice from your phone right now. Your place is held — this screen will catch up on its own. If you're nearby, stay in the building."
4. → 12px → `outline-neutral` "Try again now" (full width, 44 tall).
5. No intake or messaging rows. "Leave the queue" stays.

Trigger: two failed polls or a dropped socket (11.6).

### 8.9 P9 Called, in consultation

1. App bar (status variant).
2. → 20px → **Called card** (fill `primary-50`, 1px `primary-300`, radius 14, padding 28 top, 28 bottom, centred):
   - the pill "In consultation" (white fill, `primary-600` text);
   - → 20px → a 72px white circle with a 28px `stethoscope` in `primary-600`;
   - → 20px → "You're being seen now" (20/26 700 `primary-900`);
   - → 8px → "Dr N. Mokoena has called you. Please go through to Room 2." (14/22 `slate-600`, centred, max width 320).
3. → 16px → **"Your visit" card** (padding 16): the title "Your visit" (13/600 `slate-600`) → three key-value rows: "Joined" "09:12", "Called" "09:41", "Intake" "Submitted" (`accent-600`).
4. → 20px → "Updated just now" (live dot).
5. No "Leave the queue" link. Vibrate on entering this state (`navigator.vibrate([200,100,200])` where supported).

### 8.10 P10 Done, feedback prompt

1. App bar (status variant, no refresh).
2. → 20px → **Done card** (fill `accent-50`, 1px `accent-200`, radius 14, padding 28/28, centred):
   - the pill "Done" (white, `accent-600`);
   - → 20px → a 72px white circle with a `circle-check` (28px `accent-600`);
   - → 20px → "Visit complete" (20/26 700 `accent-600`);
   - → 6px → "Seen at 09:41 · 22 minutes in the room" (14/400 `slate-600`).
3. → 16px → **Feedback card** (padding 20, centred):
   - "How was your visit today?" (15/500 `slate-900`);
   - → 14px → stars (4 of 5 filled in the drawing);
   - → 16px → a textarea with the placeholder "Anything you'd like the practice to know? (optional)" (left-aligned);
   - → 12px → `primary-xl` "Send feedback";
   - → 10px → "Shared with reception as a rating and comment. Not part of your clinical record." (12/18 `slate-600`, centred).
4. → 16px → **Follow-up row card**: a tile (`slate-100`, `calendar` `slate-600`) → "Book a follow-up" (15/600) over "Dr Mokoena suggested two weeks" → "Open" (14/600 `primary-600`, B3). Shown only when a follow-up is set (`sp_visit_set_follow_up`).
5. After sending **(derived)**: the feedback card collapses to "Thanks — your feedback was sent to reception." with a `check`.

### 8.11 P11 Cancelled by the practice

1. App bar (status variant, no refresh).
2. → 20px → **Cancelled card** (white, padding 28/28, centred):
   - the "Cancelled" pill;
   - → 20px → a 72px `slate-100` circle with a `circle-x` (28px `slate-500`);
   - → 20px → "This visit was cancelled" (20/26 700);
   - → 8px → "Cancelled by reception at 10:04. You are no longer in the queue." (14/22 `slate-600`).
3. → 16px → **"What you can do now" card** (padding 16):
   - the title (15/600);
   - → 4px → "Joining again puts you at the back of the queue. Reception can explain what happened." (14/22 `slate-600`);
   - → 16px → `primary-l` "Join the queue again";
   - → 10px → `outline-neutral` "Call reception · 011 447 2210" (`tel:` link).

### 8.12 P12 Leave-queue confirmation

P7 renders underneath, dimmed by the overlay. The bottom sheet (5.7) contains:

1. the destructive tile;
2. "Leave the queue?";
3. "You'll lose position **#3**. This can't be undone — to be seen today you'd have to join again from the start, behind everyone currently waiting." (#3 in 15/700 `slate-900`);
4. `primary-l` "Keep my place" (default focus);
5. `outline-destructive` "Yes, leave the queue".

Tapping the overlay is the same as "Keep my place". Leaving calls `sp_visit_leave_by_token` and shows P11 with the text "You left the queue at HH:MM." **(derived)**.

### 8.13 P13 Quick intake (`/q/[token]/intake`)

1. **App bar** (task variant): back + "Quick intake" + "3 of 4", with the progress bar at 75%.
2. → 16px → the intro "Four short questions. Reception and the doctor see your answers as categories — nothing you type is shown publicly." (14/22 `slate-600`).
3. → 16px → **Question cards**, 16px apart (padding 20). Each card has a caption "Question N" (13/400 `slate-600`), then 6px → the prompt (16/22 600 `slate-900`), then 16px → the control:
   - "Question 3" "How would you rate the pain or discomfort right now?" → scale 0 to 5 with "4" selected, end labels "0 — none" / "5 — severe".
   - "Question 4" "Are you taking any chronic medication?" → Yes / No.
4. → 16px → **Answered summary card** (fill `slate-50`, 1px `slate-200`, padding 20): "Question 1 · answered" (13/400 `slate-400`) → "What brings you in today?" (16/400 `slate-500`) → 8px → the answer "Cough or cold symptoms" (15/500 `primary-600` at 70% opacity). Tapping it re-opens that question **(derived)**.
5. → 20px → `primary-xl` "Submit intake" (full width).

**The rule that produces this drawing (B5):** the page lists every unanswered required question, in order, as open cards. Answered questions collapse into summary cards below them. The counter shows the number of the first open question, out of the total. Each answer saves immediately (`sp_intake_answer_save`). "Submit intake" is enabled when every required question has an answer, and calls `sp_intake_submit`. (In the drawing, question 2 has been answered and its summary is scrolled out of view.)

### 8.14 P14 Intake submitted

1. **App bar**: the title "Quick intake" only (no back, no counter, no progress bar).
2. Content centred vertically in the remaining space:
   - a 76px `accent-50` circle with a `circle-check` (28px `accent-600`);
   - → 20px → "Intake submitted" (20/26 700);
   - → 8px → "Dr Mokoena will see your answers before you go in. You're still #3 in line." (14/22 `slate-600`, centred; the position is live);
   - → 20px → `outline-primary-m` "Back to my queue position" → P7.

### 8.15 P15 Notification preview (`/q/[token]/messages`)

1. **App bar** (task variant): back + "What we'll send you".
2. → 16px → the intro "Messages go to 082 431 9087. WhatsApp first; if it can't be delivered we fall back to SMS. Both are sent by the practice, never with medical detail." (14/22 `slate-600`).
3. → 16px → **WhatsApp card** (padding 0):
   - Header row (padding 16, a 1px bottom divider): a 36px tile (`accent-50`, `message-circle` 18px `accent-600`) → "WhatsApp" (15/600) over "Rosebank Family Practice · verified" (13/400 `slate-600`) → the pill "Primary" (accent) at the right.
   - Body (`slate-50`, padding 16): message bubbles, left-aligned, 82% wide, 10px apart. Bubbles are white, 1px `slate-200`, radius 12, padding 14 × 16, with the text in 14/22 `slate-900` and the time in 12/400 `slate-400` 8px below:
     - "You're in the queue at Rosebank Family Practice. Position 3. Estimated wait 20–35 min — this can change. Track it live: bby.co.za/q/8fd2" · "09:12"
     - "You're two away. Please make your way to reception at Rosebank Family Practice. bby.co.za/q/8fd2" · "09:34"
     - "Dr N. Mokoena is ready for you. Please go through to Room 2." · "09:41". This bubble is filled `primary-50` with a `primary-200` border.
4. → 16px → **SMS card**: the same header with a `primary-50` tile and a `mail` icon (`primary-600`), "SMS" over "Sender ID: BabyBlue", and the pill "Fallback" (neutral). Its bubbles are full width:
   - "Rosebank Family Practice: you are #3 in the queue. Estimated wait 20-35 min (not a booked time). Live status: bby.co.za/q/8fd2" · "09:12 · 148 characters"
   - "Rosebank Family Practice: you're next. Please come to reception now. bby.co.za/q/8fd2" · "09:34 · 84 characters"

   SMS copy uses a hyphen ("20-35"), not an en dash, to stay in the GSM-7 character set.
5. → 16px → **Info banner** with a `file-text` icon: "Messages never contain a reason for the visit, an intake answer or a diagnosis. Only your position, the estimate and the practice name."

Render these bubbles from the same template source the sender uses (11.5), so the preview never drifts from the real messages.

---

## 9. Staff screens, frame by frame (S1 to S12)

### 9.0 Frame and responsiveness

- **Design width:** 1320 × ~860, with the shell from 5.5 (240 sidebar + 1080 main area). Auth screens (S1 to S3) are drawn as 900px-wide cards and are centred on a `slate-50` page.
- **Above 1320px:** the sidebar stays 240; the main content column caps at 1200 and is left-aligned with the 28px padding.
- **1024 to 1319px:** the layout is the same, with the content column fluid. Two-column screens keep their split down to 1100px, then stack the right column under the left.
- **768 to 1023px (tablet)** **(derived)**: the sidebar collapses to a 72px icon rail (icons centred, labels hidden, tooltips on hover); stat cards become a 2 × 2 grid; the S4 table hides the "Joined" column and moves it under the patient name.
- **Below 768px:** not supported for staff in v1. Show a notice: "BabyBlue's staff portal needs a tablet or larger screen."

All text in quotation marks is verbatim from the canvas. The signed-in user is "Naledi Mokoena", "Admin".

### 9.1 S1 Sign in (`/staff/sign-in`)

A 900 × 600 card (white, 1px border, radius 14, overflow hidden), centred on the page, split in two:

- **Brand panel**, left, 380 wide, `primary-900` fill, padding 32:
  - top: the on-dark mark (24) + "BabyBlue" (16/600 white);
  - bottom-aligned: the tagline "One live list for the front desk, one honest estimate for the patient." (20/28 500 white, max width 300) → 16px → the fine print (13/20, white at 65% opacity). The drawing shows "Rosebank Family Practice · 3 staff accounts · POPIA operator agreement signed 4 March 2026"; build B6.
- **Form panel**, right, `slate-50` fill, with the form vertically centred and 380 wide, starting 64px from the panel's left edge:
  - "Sign in" (24/32 700);
  - → 4px → "Use your practice email address." (14/400 `slate-600`);
  - → 24px → "Email" (label 14/500) → `input` with "reception@rosebankfamily.co.za";
  - → 16px → "Password" → `input` with masked dots and the `eye` toggle;
  - → 16px → `primary` "Sign in" (full width, 48 tall);
  - → 16px → a row with "Forgot password" (14/500 `primary-600`) at the left and "New practice? **Sign up**" at the right ("New practice?" 14/400 `slate-600`, "Sign up" 14/500 `primary-600`).
- Errors **(derived)**: a generic message above the button in an error banner (`error-50`, 13/20 `error-600`): "That email and password don't match. Try again or reset your password." After 5 failed attempts, lock for 15 minutes with the same layout.

### 9.2 S2 Onboarding 1 of 2, clinic setup (`/staff/onboarding`)

A 900-wide card on `slate-50` (fill `slate-50`, 1px border, radius 14, padding 32):

1. The mark (32) + "BabyBlue" (16/600).
2. → 20px → **Stepper:** "1 Practice" (current) —— "2 Your profile" (upcoming).
3. → 24px → "Set up your practice" (24/32 700) → 4px → "This is what patients see when they scan your code. You can change all of it later." (14/400 `slate-600`).
4. → 20px → a **white card** (padding 24) containing:
   - "Practice name" → "Rosebank Family Practice".
   - → 16px → "Patient link" → slug field: prefix "bby.co.za/c/" + "**rosebank-family**", status "Available".
   - → 16px → "Street address" → "18 Cradock Avenue, Rosebank, Johannesburg, 2196".
   - → 16px → two columns: "Reception phone" → "011 447 2210" | "Average consult duration" → select "15 minutes" → 8px → the hint "Used for the first estimates until we've watched a few real days." (12/400 `slate-600`).
5. → 20px → buttons right-aligned: `secondary` "Back" → 12px → `primary` "Continue" (both 48 tall).

### 9.3 S3 Onboarding 2 of 2, staff profile

The same card:

1. Mark + wordmark → **Stepper:** "✓ Practice" (done, accent) —— "2 Your profile" (current).
2. "Your staff profile" (24/32 700) → "Your name shows on the queue log when you call or cancel a patient."
3. A **white card** (padding 24):
   - two columns: "First name" "Naledi" | "Last name" "Mokoena";
   - → 16px → "Mobile number" "083 204 7712" | "HPCSA number (optional)" "MP0784412";
   - → 20px → a **bordered info banner**: "You'll be set as **Admin** — the only role that can change settings and add staff. Your practice is created as **pending** and goes live once it's approved. You can invite reception and clinician accounts after that."
4. → 24px → a footer row: at the left, "By continuing you confirm you're authorised to process patient information for this practice under POPIA." (13/20 `slate-600`, max width 380); at the right, the `accent` button "Go to queue" (48 tall, 24px padding).
5. Submitting calls `sp_onboarding_submit`. Because the practice is pending, "Go to queue" lands on the Pending screen (10.5) until approval.

### 9.4 S4 Queue dashboard (`/staff/queue`), the primary screen

1. **Page header:** "Today's queue" over "Tuesday, 14 October 2026 · Dr N. Mokoena, Dr A. Petersen on shift". Actions at the right: `secondary-primary` "New booking" (with `calendar`) → 12px → `primary` "Add walk-in" (with `user-plus`).
2. **New, A4:** when urgent reviews are pending, a warning banner between the header and the stats (10.2).
3. → 20px → **Stat cards** (4 × 242, 18px gaps, 80 tall, padding 16). Each has a label (12/400 `slate-600`) and, 4px below, a value (28/700):
   - "Waiting" "6" (`slate-900`)
   - "Called today" "11" (`primary-600`)
   - "Seen today" "9" (`accent-600`)
   - "Estimated median wait" (with a `clock` 14px) "24" + " min" (16/400 `slate-600`)
4. → 20px → a row: the segmented tabs "All 17", "Waiting 6", "In consultation 2", "Done 9" (All active) at the left; the live dot + "Live · updated just now" at the right.
5. → 12px → the **Queue table** (5.8). Columns and their left offsets inside the table: "#" (16), "Patient" (84), "Reason" (298), "Joined" (498), "Estimated wait" (607), "Actions" (right-aligned, 16 from the right edge).

| # | Patient | Reason | Joined | Estimated wait | Actions |
| --- | --- | --- | --- | --- | --- |
| "—" (`primary-600`) | **Fatima Patel** / 082 776 1104 | pill "Urgent" + "Chest pain" | 09:38 | pill "In consultation" | "Mark seen" (soft-accent), "Open" |
| "#1" | **Thabo Dlamini** / 082 431 9087 | "Routine" + "Cough or cold" | 09:12 | "Under 10 min" / Estimated | "Call next" (solid), "Cancel", "Open" |
| "#2" | **Lerato Mokoena** / 073 812 4460 | "Soon" + "Repeat script" | 09:20 | "10–20 min" | "Call", "Cancel", "Open" |
| "#3" | **Sipho Khumalo** / 084 990 3312 | "Routine" + "Blood pressure check" (wraps) | 09:31 | "20–35 min" | "Call", "Cancel", "Open" |
| "#4" | **Anna van Wyk** / 061 220 8845 · booked 10:00 | "Routine" + "Follow-up" | 09:52 | "30–45 min" | "Call", "Cancel", "Open" |
| "—" (`slate-400`) | Grace Nkosi / 079 554 2018 (muted) | "Dressing change" (no pill) | 08:44 | pill "Done" | "Open" (disabled look) |

   - Position text: 14/700 `primary-600` ("#1"); in-consultation and done rows show an em dash.
   - Row order: in consultation first, then waiting by position, then done rows (most recent first), then cancelled and no-show rows **(derived, as in the "All" tab)**.
   - Pill and reason sit on one line with an 8px gap.
   - Buttons are 8px apart, right-aligned.
6. The table ends after the last row. There is no pagination on S4 (a day's queue fits). Empty state **(derived)**: an inset panel reading "No one is waiting. New walk-ins and QR joins will appear here."
7. Behaviour:
   - "Call next" calls `sp_visit_call_next` and "Call" calls `sp_visit_call`; both need a practitioner (default: the signed-in clinician's practitioner, otherwise a 280px popover listing the on-shift practitioners).
   - "Cancel" shows an inline confirm in place of the row's buttons, "Cancel this visit? **Yes, cancel** · Keep" (13px; "Yes, cancel" in `error-500`).
   - "Mark seen" applies the ID gate (7.5).
   - "Open" goes to S7.
   - Updates arrive over SignalR; changed rows flash a `primary-25` fill for 600ms.

### 9.5 S5 Add walk-in modal (over S4)

A 560-wide modal.

- **Header:** "Add walk-in" over "They'll join the back of the queue at position #7" (the number is live).
- **Body:**
  1. "Find an existing patient" → a search `input` (focused, search icon, value "Khum").
  2. → 8px → **Results list** (white, 1px border, radius 12, rows 54 tall, 1px dividers, 16px padding). Each row has a name (14/500 `slate-900`) over meta (12/400 `slate-600`), with the action at the right:
     - "Sipho Khumalo" / "084 990 3312 · last visit 2 Sep 2026", with "Already in queue" (13/600 `warning-700`, not clickable). This row is filled `primary-25`.
     - "Nomvula Khumalo" / "082 118 7745 · last visit 19 Jul 2026", with "Select" (13/600 `primary-600`).
  3. → 16px → a divider with the centred label "or add someone new" (13/400 `slate-600`, white background, 12px padding).
  4. → 16px → **New, A2:** the "Who is this visit for?" control (10.1).
  5. Two-column grid:
     - "First name *" (placeholder "First name") | "Last name *" (placeholder "Last name")
     - "Nationality *" (select "South Africa") | "ID type *" (select "RSA ID")
     - "RSA ID number *" (value "8904125•••••", masked after 7 digits) with the valid helper "Valid ID — date of birth 12/04/1989" | "Phone *" (placeholder "+27 82 000 0000") with the checkbox (on) "This is the patient's WhatsApp number"
     - "Email (optional)" (placeholder "patient@email.com") | "Date of birth" (read-only "1989-04-12 · from the ID number")
     - "Reason for visit" (select "Cough or cold") | "Urgency" (segmented: "Routine" selected, "Soon", "Urgent")
  6. → 16px → the checkbox (on) "Send them the live status link by WhatsApp or SMS".
- **Footer:** `secondary` "Cancel" → `primary` "Add to queue".
- **Behaviour:**
  - Selecting an existing patient fills and locks the identity fields.
  - The ID label changes with the ID type ("Passport number *").
  - Choosing "Urgent" shows a warning line under the control: "An Admin will review this before the patient moves up." (12/400 `warning-700`, A4).
  - Submitting calls `sp_visit_add_walk_in`.

### 9.6 S6 New booking modal (over S4)

A 640-wide modal.

- **Header:** "New booking" over "A booked patient joins the queue when they arrive and check in".
- **Body:**
  1. **Patient card** (`primary-25`, 1px `primary-200`, radius 12, padding 16): a 36px avatar ("LM", filled), the name "Lerato Mokoena" (14/600) over "073 812 4460 · 8 previous visits · medical aid: Discovery Classic" (12/400 `slate-600`), and "Change patient" (13/600 `primary-600`) at the right.
  2. → 16px → two columns: "Date" (field "Wed, 15 October 2026" with a trailing `calendar` icon, opening a date picker) | "Practitioner" (select "Dr N. Mokoena").
  3. → 16px → "Time — 15 minute slots" → the slot grid (two rows of six):
     - "08:00" taken, "08:15" available, "08:30" taken, "08:45" **selected**, "09:00", "09:15";
     - "09:30", "09:45" taken, "10:00", "10:15", "Blocked", "Blocked".
  4. → 16px → "Reason for visit" (select "Repeat prescription", full width).
  5. → 16px → the checkbox (on) "Send a WhatsApp confirmation now and a reminder the evening before".
- **Footer:** the summary "Wed 15 Oct, 08:45 with Dr N. Mokoena" at the left; `secondary` "Cancel" and `primary` "Create booking" at the right.
- **Data:** slots come from `fn_booking_slots` (state: available, taken, blocked, past). Past slots render as taken.

### 9.7 S7 Appointment detail (`/staff/visits/[id]`)

1. Breadcrumb "Today's queue".
2. **Header row:**
   - Left: a 40px avatar "TD" → 12px → "Thabo Dlamini" (24/32 700) over "082 431 9087 · 34 years · joined the queue at 09:12" (13/400 `slate-600`). **New:** "Guardian: name, phone" on a second sub-line for dependants (10.1); the "ID missing" pill after the phone when relevant (A3).
   - Right: the pill "Waiting · #1" (neutral, 13/600, 28 tall) → `primary` "Call next" → `secondary` "Cancel visit".
3. → 20px → two columns: 577 | 427 at the design width (`grid-template-columns: 1.35fr 1fr`, 18px gap).
4. **Left column:**
   - **"Intake answers" card** (padding 20): key-value rows, 40 tall:
     - "What brings you in today?" **"Cough or cold symptoms"**
     - "How long has this been going on?" **"3–7 days"**
     - "Pain or discomfort right now" **"4 of 5"**
     - "Taking chronic medication?" **"No"**

     Then → 12px → "Submitted 09:19 · structured answers only, no free text collected" (12/400 `slate-600`).
   - → 16px → **"Clinical note" card**: the title "Clinical note" (16/600) + " — staff only, never shown to the patient" (12/400 `slate-600`, inline) → 12px → the `textarea` ("Productive cough 5 days, no fever reported at intake. Check chest, consider swab if febrile on examination.") → 12px → right-aligned `secondary` "Discard" and `primary` "Save note".
5. **Right column:**
   - **Estimate card** (`detail` variant): "Estimated wait for this patient" / "Under 10 min" / "Their phone shows the same figure, with the same label."
   - → 16px → **"Visit timeline" card** (padding 20): items 16px apart, each a dot (8px, 6px below the top of the line) and, 14px to the right, a title (14/500 `slate-900`) over a sub-line (12/400 `slate-600`):
     - "Joined the queue from a phone" / "09:12 · QR at reception" (primary dot)
     - "Intake submitted" / "09:19" (primary dot)
     - "“Two away” message delivered" / "09:34 · WhatsApp" (accent dot)
     - "Called" / "Pending" (hollow dot, `slate-400` text)
   - → 16px → **"Consent" card**: "Consent" (16/600) → 8px → `check` (16px `accent-600`) + "Record storage consented, 14 Oct 09:12" (14/500 `accent-600`) → 8px → "Withdrawing consent removes visit history from the patient file but keeps today's queue entry." (13/20 `slate-600`).

   The S7 consent wording above is from the canvas. Section 12 proposes a different retention default; update this sentence to match whatever the lawyer confirms.
6. Role rules: the clinical note card is hidden for Reception; reading it writes an audit entry (`note.read`).

### 9.8 S8 Patients list (`/staff/patients`)

1. **Page header:** "Patients" over "1 284 patient records · 12 added this month" (thin space as the thousands separator: `1 284`). Action: `primary` "Add patient".
2. → 20px → a row: the search `input-m` with a `search` icon (placeholder "Search by name, phone or ID number", flexible width) → 12px → the filter buttons "Seen this month" and "Consent given".
3. → 16px → **Table** with columns "Patient" (16), "Phone" (332), "Last visit" (526), "Visits" (721), "Consent" (right-aligned). Rows are 62 tall, with a 32px avatar + the name (14/600) over meta (12/400 `slate-600`):
   - "TD" **Thabo Dlamini** "34 · RSA ID on file" | "082 431 9087" | "In the queue now" | "6" | "Given"
   - "LM" **Lerato Mokoena** "41 · Discovery Classic" | "073 812 4460" | "2 Sep 2026" | "8" | "Given"
   - "SK" **Sipho Khumalo** "57 · hypertension follow-up" | "084 990 3312" | "14 Oct 2026" | "23" | "Given"
   - "FP" **Fatima Patel** "29 · passport on file" | "082 776 1104" | "In consultation" | "2" | "Not given"
   - "GN" **Grace Nkosi** "63 · wound care" | "079 554 2018" | "14 Oct 2026" | "11" | "Given"
4. → 12px → "Showing 5 of 1 284 · sorted by most recent visit" (12/400 `slate-600`).
5. Data: `fn_patient_list` (paged, 25 per page in production). Pagination **(derived)**: "Previous" / "Next" `secondary-sm` buttons at the right of the footer line.

Note: the meta line mixes an ID fact, a medical aid and a reason. In production, show "age · ID on file" or "age · medical aid"; never show a reason or condition in a list (POPIA minimisation). The drawn "hypertension follow-up" and "wound care" are fixture text only.

### 9.9 S9 Patient file (`/staff/patients/[id]`)

1. Breadcrumb "Patients".
2. **Header row:**
   - Left: a 40px avatar "SK" → "Sipho Khumalo" (24/32 700) over "57 years · 084 990 3312 · RSA ID 690412 •••• · Bonitas Standard" (the ID is masked after 6 digits; clicking it reveals the full number for Admins, writes an audit entry, and re-masks after 30 seconds).
   - Right: `secondary` "Edit details" → `primary` "Add to today's queue".
3. → 20px → two columns: 602 | 401 (`1.5fr 1fr`, 18px gap).
4. **Left column:**
   - **"Visit history" card** (padding 20): rows 56 tall, with columns date (14/600 `slate-900`, 110 wide), "reason · practitioner" (14/400 `slate-600`, wraps to two lines, 200 wide), a pill, and the source at the right (13/400 `slate-600`):
     - "14 Oct 2026" "Blood pressure check · Dr Mokoena" "Waiting · #3" "Walk-in"
     - "2 Sep 2026" "Repeat prescription · Dr Petersen" "Done" "Booked"
     - "28 Jul 2026" "Blood pressure check · Dr Mokoena" "Done" "Walk-in"
     - "11 Jun 2026" "Did not arrive" "Cancelled" "Booked"
     - "3 May 2026" "Flu vaccination · Sister Adams" "Done" "Walk-in"
   - → 16px → **"Notes" card**: the title + "Add note" link at the right → 12px → note items with a 2px `slate-200` left border and 12px left padding, 16px apart. Each has the text (14/22 `slate-900`) over "author · date" (12/400 `slate-600`):
     - "On amlodipine 5 mg. Readings at home averaging 138/86 over the last month." / "Dr N. Mokoena · 2 Sep 2026"
     - "Prefers morning appointments. Contact by WhatsApp, not calls." / "Reception · 28 Jul 2026"
5. **Right column:**
   - **"Contact" card**: label/value pairs, 10px apart (labels 12/400 `slate-600`, values 14/400 `slate-900`):
     - "Mobile" "084 990 3312" + the tag "WhatsApp" (12/600 `accent-600`)
     - "Address" "42 Oxford Road, Saxonwold"
     - "Next of kin" "Nomvula Khumalo · 082 118 7745"
   - → 16px → **"Visit pattern" card**: key-value rows "Visits in 12 months" **7**, "Average time waited" **26 min**, "Missed appointments" **1**.
   - → 16px → **"POPIA" card**:
     - `check` + "Record storage consented" (14/500 `accent-600`);
     - → 6px → "Given 3 May 2026 at this practice. Patient can withdraw at any time." (13/20 `slate-600`);
     - → 12px → `soft-neutral` "Export file" and "Withdraw consent" (Admin only; Withdraw opens a confirm dialog that states what is kept, from section 12).

### 9.10 S10 Settings: hours and blocked time (`/staff/settings/hours`)

1. **Page header:** "Settings" over "Practice hours, blocked time and the intake questions patients answer".
2. → 20px → **Settings tabs** (segmented): "Hours" (active), "Blocked time", "Intake questions" (S11), "Practice details" (10.6), "Staff" (10.7).
3. → 20px → two columns: 568 | 437 (`1.3fr 1fr`, 18px gap).
4. **Left column, "Practice hours" card** (padding 20):
   - the title → "Patients can only join the queue while you're open." (13/400 `slate-600`);
   - → 16px → seven rows, 54 apart. Each row has the day (14/600 `slate-900`, 112 wide), the opening time (`input-m`, 164 wide), 12px gap, the closing time (`input-m`, 164 wide), and a toggle at the right:
     - "Monday" 07:30 17:00 on
     - "Tuesday" 07:30 17:00 on
     - "Wednesday" 07:30 17:00 on
     - "Thursday" 07:30 17:00 on
     - "Friday" 07:30 16:00 on
     - "Saturday" 08:00 12:00 on
     - "Sunday" (day text `slate-400`) with disabled fields reading "Closed" and the toggle off
   - → 16px → `primary` "Save hours", right-aligned.
5. **Right column:**
   - **"Blocked time" card**: the title + "Add block" link → "Nobody can be booked into these windows and the queue pauses." (13/400 `slate-600`) → 12px → item rows (white, 1px border, radius 12, 64 tall, padding 12, 8px apart). Each has a 36px icon tile (radius 10), the title (14/500 `slate-900`) over the detail (12/400 `slate-600`), and "Edit" (13/500 `slate-600`) at the right:
     - warm tile (`warning-50`, `clock` `warning-700`): "Lunch — every weekday" / "13:00–13:45 · repeats weekly"
     - `slate-100` tile with `calendar` `slate-600`: "Dr Petersen — theatre list" / "Thu 16 Oct, 08:00–12:00"
     - `slate-100` tile with `calendar`: "Public holiday — Heritage Day" / "Thu 24 Sep, all day · practice closed"
   - → 16px → **"Patient QR code" card**:
     - the title → "Print this for reception. It opens bby.co.za/c/rosebank-family." (13/400 `slate-600`);
     - → 16px → a row with the QR (112 × 112, radius 10, rendered from the slug; the canvas shows a striped placeholder labelled "QR code") and, 16px to the right, a 3-button stack (8px gaps, 40 tall each): `secondary` "Copy link", `primary` "Download QR", `secondary` "Open patient app";
     - → 16px → the warning line "Changing the slug breaks existing QR codes and patient links." (12/400 `warning-700`).
   - → 16px → **"Estimates" card**: the title → "Estimates use your average consult duration until there are enough real consults to measure. Today's median is 24 minutes." (13/20 `slate-600`; the number is live).
6. The canvas shows only the Hours tab. The "Blocked time" tab shows the same Blocked time card at full width with an add/edit form **(derived)**.

### 9.11 S11 Intake question builder (`/staff/settings/intake`)

1. Breadcrumb "Settings" → **Page header** "Intake questions" over "Four active questions · shown to patients after they join the queue". Action: `primary` "+ Add question" (with `plus`).
2. → 20px → two columns: 602 | 401 (`1.5fr 1fr`, 18px gap).
3. **Left column, "Active questions" card** (padding 0):
   - Header row (padding 20, 1px divider): the title + "Drag to reorder" (12/400 `slate-600`) at the right.
   - Question rows (padding 16 × 20, 1px dividers). Each row has a `grip-vertical` handle (14px `slate-300`, 20px column), the prompt (14/600 `slate-900`), then 4px → the type pill + meta (12/400 `slate-600`, "7 options · required"), with `soft-neutral` "Edit" and a toggle at the right:
     - "What brings you in today?" "Multiple choice" "7 options · required" (on)
     - "How long has this been going on?" "Multiple choice" "4 options · required" (on)
     - **Editing state** (row fill `primary-25`): "How would you rate the pain or discomfort right now?" with the pill "Scale" at the right, then the inline editor, a two-column grid of `input-s`: "Question type" (select "Scale") | "Range" ("0 to 5"); "Low label" ("None") | "High label" ("Severe"); then `primary-sm` "Save question", `secondary-sm` "Cancel", and `text-destructive` "Delete question" at the right
     - "Are you taking any chronic medication?" "Yes / no" "required" (on)
     - **Inactive** (whole row at 55% opacity): "Have you been here before?" "Yes / no" "off — answered automatically from the file" (off)
4. → 16px → **Info banner**: "Free-text answers are switched off for this practice. Structured answers keep intake out of the patient's public view and readable at a glance in the queue."
5. **Right column:**
   - **"Patient preview" card**: the title → "Question 3 of 4, as it appears on a phone" (13/400 `slate-600`) → 12px → a preview panel (`slate-50`, 1px border, radius 12, padding 14) containing the progress bar (75%), "Question 3" (12/400), the prompt (15/600), the scale picker (36 tall) with "4" selected, and the end labels "0 — none" / "5 — severe". The preview follows the question being edited.
   - → 16px → **"Add a question" card**: four option rows (white, 1px border, radius 12, 56 tall, 8px apart), each with a 32px `primary-50` tile + icon, the title (14/600) and a sub-line (12/400 `slate-600`):
     - "Multiple choice" / "Pick one from a list you define"
     - "Scale" / "A number in a range, with end labels"
     - "Yes / no" / "Two tap targets, nothing to type"
     - "Free text" / "Off — narrative detail belongs in the consult": **disabled** (dashed 1px `slate-200` border, all text `slate-400`, tile `slate-100`)
6. Drag-and-drop with `@dnd-kit/sortable`; the order saves on drop (`sp_intake_questions_reorder`). Keyboard reordering: focus the handle, then Space and the arrow keys.

### 9.12 S12 My profile (`/staff/profile`)

1. **Page header:** "My profile" over "Naledi Mokoena · Admin · signed in on 2 devices".
2. → 20px → two columns: 587 | 418 (`1.4fr 1fr`, 18px gap).
3. **Left column, profile card** (padding 24):
   - a 56px avatar "NM" → 16px → "Naledi Mokoena" (16/600) over "naledi@rosebankfamily.co.za" (13/400 `slate-600`), with the pill "Admin" at the right;
   - → 20px → a 1px divider → 20px → a two-column form: "First name" "Naledi" | "Last name" "Mokoena"; "Mobile number" "083 204 7712" | "HPCSA number" "MP0784412";
   - → 20px → right-aligned `secondary` "Discard" → `primary` "Save changes".

   The email is read-only and is not an input.
4. **Right column:**
   - **"Notifications" card** (padding 20): rows 56 tall with dividers, each with a title (14/500 `slate-900`) over a sub-line (12/400 `slate-600`) and a toggle at the right:
     - "Urgent walk-in added" / "Browser alert while the queue is open" (on)
     - "Daily summary" / "Emailed at 17:30 each weekday" (off)
   - → 16px → **"Security" card**: rows with dividers:
     - "Password" — "Change" (13/500 `primary-600`)
     - "This device" / "Chrome on Windows · reception desk" — "Active" (13/600 `accent-600`)
     - "iPhone · Safari" / "Last used 2 days ago" — "Sign out" (13/500 `error-500`, revokes the session immediately)

---

## 10. Screens and states the canvas does not draw

These come from your decisions or from states every screen needs. They use only the tokens and components above, so they sit naturally next to the drawn screens. Everything in this section is **(derived)**.

### 10.1 "Who is this visit for?" (P6 and S5, decision 5)

- **Control:** a segmented choice (5.3) with two options, "Me" and "Someone I care for". It is placed at the top of the P6 form card and at the top of the S5 "add someone new" section, under the label "Who is this visit for?" (14/500). Default: "Me".
- **When "Someone I care for" is chosen (P6):**
  - The name fields relabel to "Patient's first name" and "Patient's last name".
  - Add "Patient's date of birth" (a date input, `input-l`).
  - Then a divider and the heading line "**Your details** — we'll message you instead".
  - Then "Your name", "Relationship" (select: Parent, Legal guardian, Spouse or partner, Adult child, Other carer), and "Your phone number" with the WhatsApp checkbox. The patient's own phone field is hidden.
- **When the date of birth gives an age under 18:** the guardian fields become required (the asterisk shows), and the consent text becomes "I am the parent or guardian of {first name} and agree that Rosebank Family Practice may store their visit records…".
- **S5:** the same control. The grid gains "Guardian name *", "Relationship *" and "Guardian phone *" (with the WhatsApp checkbox), placed after "Date of birth".
- **S4 and S7:** for dependants, a second meta line under the phone reads "Guardian: Sipho Khumalo · 084 990 3312" (12/400 `slate-600`).

### 10.2 Urgent-flag banner and pill (S4, decision 2)

- When a visit is flagged Urgent and not yet decided, its reason pill reads "Needs review" (5.6) instead of "Urgent", and its position does not change.
- A **warning banner** appears between the page header and the stat cards, 20px below the header, full width. It has a `triangle-alert` icon (18px `warning-700`), "**1 urgent flag needs review**" (14/600 `warning-800`), and "Fatima Patel was marked Urgent by Lerato Mokoena at 09:38 · Chest pain" (13/400 `warning-800`). At the right is a `secondary-sm` "Review" button that opens 10.3. With several flags, the banner shows the count and the oldest flag, and "Review" opens them in order.
- Non-admins see the same banner without the button, with the text "Waiting for an Admin to review."

### 10.3 Urgent review dialog (Admin)

- A 480-wide modal. Title "Review urgent flag"; subtitle "Moving a patient up changes everyone's estimate."
- Body: key-value rows "Patient" **Fatima Patel**, "Reason" **Chest pain**, "Flagged by" **Lerato Mokoena · 09:38**, "Current position" **#5**. Then "Reason for your decision *" (a textarea 88 tall, placeholder "Shown in the visit timeline and the audit log").
- Footer: `secondary` "Decline" and `primary` "Approve and move to #1". Both are disabled until the reason has at least 3 characters. Pressing one with an empty reason shows the error "A reason is required" (13/400 `error-500`) under the field.
- After a decision: the banner updates. The row shows "Urgent" (approved, now at #1) or "Routine" (declined), and the S7 timeline gains "Urgent move-up approved by Naledi Mokoena · reason" or "Urgent flag declined · reason".

### 10.4 S13 Practice approvals (platform admin, decision 6)

- **Shell:** the staff shell, with the sidebar brand block reading "BabyBlue" over "Platform" (12/400 `slate-600`) and the nav items "Practice approvals" (`circle-check`), "Leads" (`inbox`) and "Billing" (`receipt`).
- **List (`/platform/practices`):**
  - Header "Practice approvals" over "3 waiting for review".
  - Segmented tabs: "Pending 3", "Approved 18", "Declined 2", "Suspended 0".
  - Table columns: "Practice" (name 14/600 + `bby.co.za/c/slug` 12/400), "Submitted by" (name + email), "Address", "Submitted" (date and time), "Status" (pill), and an action "Review" (`soft-primary`).
- **Detail (`/platform/practices/[id]`):**
  - Breadcrumb "Practice approvals". Header: the practice name, with the pill "Pending" and the subtitle "Submitted 21 Oct 2026, 14:05".
  - Two columns (1.35fr 1fr).
  - Left: three cards. "Practice" (key-values: Name, Patient link, Street address, Reception phone, Average consult, Categories). "Applicant" (Name, Email with an `accent-600` "verified" tag, Mobile, HPCSA number). "Agreement" (Operator agreement version, Accepted at).
  - Right: a "Decision" card containing "Reason *" (textarea, "Shown to the applicant by email"), `outline-destructive` (44 tall) "Decline" and `primary` "Approve". Below it, a "History" card listing earlier submissions and decisions (date, decision pill, reason).
  - Approving calls `sp_practice_review_decide(true)`, which seeds the defaults, starts the subscription and raises the installation invoice. Both outcomes send an email.

### 10.5 Pending and declined screen (`/staff/pending`)

Use the S2 card frame (900 wide, `slate-50` card, mark at the top). The stepper is replaced by a status pill.

- **Pending:**
  - the pill "Pending";
  - → 16px → "Your practice is under review" (24/32 700);
  - → 4px → "We check every new practice before it goes live. We'll email naledi@rosebankfamily.co.za as soon as it's approved — usually within one working day." (14/22 `slate-600`);
  - → 20px → a white card summarising the submitted details (key-values, as on S13);
  - → 20px → "Questions? Email support@babyblue.co.za" (13/400 `slate-600`; replace with the real address).
- **Declined:**
  - the pill "Declined";
  - the title "We couldn't approve your practice yet";
  - an error-tinted banner (`error-50`, radius 12, padding 16) with "Reason from the BabyBlue team" (13/600 `error-600`) over the reason (14/22 `slate-900`);
  - the `primary` button "Edit and resubmit", which returns to S2 with the data filled in.

### 10.6 S10 "Practice details" tab

- One card (1.35fr column) with the S2 fields: Practice name, Patient link (changing it shows the S10 slug warning in a confirm dialog), Street address with a map pin button (sets latitude and longitude), Reception phone, Average consult duration.
- A "Categories" checkbox group: General practice, Dentist, Clinic.
- Two toggle rows: "Show in Find a clinic" (on) and "Allow free-text intake answers" (off). Turning the second one on shows the warning line "Free text can contain health details. Only switch this on if your practice needs it." (12/400 `warning-700`).
- `primary` "Save changes".

### 10.7 S10 "Staff" tab

- **"Staff" card:**
  - the title + `primary` "Invite staff";
  - a table: "Name" (avatar, name, email), "Role" (an `input-s` select: Admin, Reception, Clinician), "Status" ("Active" in `accent-600`, or "Deactivated" in `slate-400`), "Last active", and the action `soft-neutral` "Deactivate" / "Reactivate";
  - pending invitations below, under a 12/500 `slate-400` label "Invitations", each with "Resend" and "Revoke" links.
- **Invite modal** (480): "Email *", then "Role" as a segmented choice (Admin, Reception, Clinician); footer "Cancel" / "Send invitation".
- **"Practitioners" card:** rows with the name, the room (`input-s`, 100 wide) and an "On shift" toggle; "Add practitioner" link.
- Visit reasons: a "Visit reasons" card with a reorderable list of labels (the S11 row style without type pills) and "Add reason".
- Removing the last Admin is blocked with the error "A practice must keep at least one active Admin" (BB602).

### 10.8 States every screen needs

- **Loading:** skeleton blocks in `slate-100`, radius matching the element, with a 1.2s shimmer (`slate-100` to `slate-50`). The layout must not jump when data arrives.
- **Error (could not load):** an inset panel reading "We couldn't load this. Check your connection and try again." with a `secondary` "Try again" button. The patient app uses the P8 pattern instead whenever a visit is already loaded.
- **Toast:** bottom centre on patient screens and bottom right on staff screens. `slate-900` fill, white 14/500 text, radius 12, padding 12 × 16, auto-hide after 4s. Used for "Link copied", "Saved", "Booking created".
- **Expired or invalid visit link** (`/q/[token]`): the patient frame with a centred 72px `slate-100` circle and `link-2-off` (28px `slate-500`), the title "This link has expired" (20/700), the body "Visit links only work on the day of your visit. If you still need help, call the practice." and, when the practice is known, `outline-neutral` "Call reception · {phone}".
- **Practice closed (P6 opened while closed):** the form is replaced by an inset panel: "Rosebank Family Practice is closed right now. It opens tomorrow at 07:30." with `outline-neutral` "Call reception".

---

## 11. Queue, estimates, messaging and offline

### 11.1 Estimate engine

Position and estimate are computed on the server so every client shows the same result. Position is derived by ordering waiting visits by `joined_at` (with approved urgent move-ups applied); it is never stored.

For a waiting patient at position n, the expected wait is the sum of expected consult durations of everyone ahead, divided by the practitioners currently seeing patients, plus any blocked time inside that window:

```
W(n) = ( sum of d(i) for i = 1 to n-1 ) / k + B
```

Here d(i) is the expected duration of visit i, k is practitioners in session, and B is overlapping blocked minutes (for example lunch 13:00 to 13:45).

- Expected duration: the practice's average consult setting until at least 20 real consults exist; then the rolling median of the last 30 consults for that practitioner.
- Range: W(n) plus or minus a spread taken from the interquartile range of recent consults, never below 5 minutes. Round to 5-minute steps. Position 1 shows "Under 10 min".
- Always labelled Estimated. Refresh on every queue event and at least every 60 seconds.
- Dashboard median wait (S4) is the median of current estimates for waiting visits.

### 11.2 Ordering

Default order is arrival. Staff may Call any waiting visit out of order and every other estimate recalculates. Urgent move-ups happen only after an admin approves them (7.4).

### 11.3 Messaging provider (decision 7)

**SendGrid cannot send WhatsApp or SMS.** It is an email platform. Plan for two providers:

| Channel | Used for | Provider |
| --- | --- | --- |
| Email | Practice approval and decline, verification, password reset, daily summary, optional patient booking confirmations | SendGrid |
| WhatsApp and SMS | Queue confirmation, "two away", "ready for you", cancellation, booking reminders | A messaging provider with WhatsApp Business API and SMS, for example Twilio (which also owns SendGrid), Clickatell or BulkSMS. Compare current rates and South African sender-ID support before choosing. |

Requirements for the WhatsApp and SMS provider: pre-approved WhatsApp utility templates, a verified business account, delivery-status webhooks, STOP handling, and a clean fallback from WhatsApp to SMS.

### 11.4 Message cost against the R200 plan (decision 8)

At R2,000 installation and R200 per month, per-message cost matters. As an illustration only (my assumptions, replace with real provider quotes): a clinic seeing 40 patients a day for 22 days, at three messages per visit, sends about 2,640 messages a month. At a cost of even R0.25 to R0.60 per message that is roughly R660 to R1,580, which is more than the R200 subscription.

Options to decide before launch:

- Pass message costs through to the practice as a usage line on the invoice.
- Include a monthly message allowance in the R200 and charge above it.
- Send WhatsApp first and cap SMS fallbacks; send only the three essential messages (confirmation, two away, ready).
- Raise the monthly price. You noted it will be updated later; use real quotes when you do.

Payments in the MVP: invoice manually (EFT) for the installation fee and monthly fee. Do not build a payment gateway until the pilot proves the price.

### 11.5 Notification triggers

| Trigger | Intent | Channel |
| --- | --- | --- |
| Visit created | Position, estimate with "this can change", live link | WhatsApp, SMS if undelivered after 2 minutes |
| Position reaches 3 or fewer ("two away") | Make your way to reception | WhatsApp, SMS fallback |
| Staff calls patient | Practitioner is ready, room number | WhatsApp, SMS fallback |
| Staff cancels | No longer in the queue, call reception | WhatsApp, SMS fallback |
| Booking created | Confirmation, then reminder the evening before | WhatsApp, SMS fallback |

The exact wording of each template is drawn on P15 (8.15); use it verbatim. No diagnosis, reason or intake content in any message. Keep SMS under 160 characters where possible (the drawn confirmation is 148). Store delivery status and provider id, not extra identifiers.

### 11.6 Realtime and offline

The client subscribes to its visit and the practice queue summary. If the socket drops it polls every 15 seconds. After two failed polls it shows the P8 banner, keeps the last known position and stamps "Last confirmed N minutes ago". On reconnect it fetches current state, removes the banner and announces the change with `aria-live`. Staff screens use the same channel and the S4 live dot turns to the warning state when stale (5.6). As a PWA, cache the app shell so the offline banner still renders without a network.

---

## 12. POPIA, privacy and security

This is an engineering checklist, not legal advice. Have a South African privacy lawyer review the consent text, operator agreement and retention rules before launch.

The app stores health-related information about identifiable people, which South African law treats as special personal information. The practice decides why and how data is used (responsible party); BabyBlue processes it on the practice's behalf (operator). The canvas references a signed operator agreement (S1) and an authorisation statement (S3): both need real documents and versioned acceptance records.

### Controls to build

- **Minimise:** only name and phone are needed to join. ID is collected for billing (7.5) with its purpose stated. Nationality, email, medical aid and next of kin are optional.
- **Consent:** record-storage consent is a separate, unchecked, withdrawable checkbox with a versioned notice. Joining must work without it.
- **Minors:** guardian required (7.6, 10.1); the guardian gives consent.
- **Access:** tenant filter on every query, role matrix enforced on the server, every read of a patient file, ID reveal, note and export audited.
- **Encryption:** TLS everywhere; encryption at rest; field-level encryption for ID numbers and clinical notes with keys held outside the database.
- **Visit tokens:** 128-bit random, hashed at rest, expire after the visit, rate-limited, first name only in public views, `noindex` and no-referrer headers on `/q/` routes.
- **Messaging:** no medical content; opt-out honoured; delivery logs kept for the practice.
- **Authentication:** email verification, strong passwords, optional TOTP for Admin, device list and remote sign-out, idle timeout on shared reception machines.
- **Retention:** a default schedule per data type, configurable by Admin, with automatic deletion jobs and a documented backup retention.
- **Hosting and transfers:** South African or nearest-region hosting; document any cross-border processing (messaging, email, error tracking); keep patient data out of third-party logs and analytics.
- **Incidents:** a breach runbook, a named contact, alerts from the audit log, and a notification template for practices.
- **Analytics:** none on `/q/` routes; consent-based only on marketing pages.

### Open question 4, explained

The canvas (S7) says "Withdrawing consent removes visit history from the patient file but keeps today's queue entry." The problem: medical practices are usually required by professional rules to keep patient records for a number of years, so a patient pressing "Withdraw consent" may not be able to make the practice delete everything.

What the app needs to know is: when a patient withdraws consent, what exactly is deleted, and what is kept because the practice must keep it?

Proposed default until a lawyer confirms:

- Withdrawing stops BabyBlue from storing new visit history for that patient and hides past history from reception's day-to-day view.
- Clinical notes and billing data are kept for the legally required period, then deleted automatically.
- The practice, not BabyBlue, decides on any early deletion request and the Admin sees a clear message saying so.

### Testing

Tenant-isolation tests for every query (a user from practice A must never see practice B, including through SignalR groups), token enumeration tests, role-matrix tests, and a test that a declined or pending practice cannot reach queue endpoints.

---

## 13. Build phases

Ship first the smallest slice a clinic will pay for: join by QR, a live queue, an honest estimate, a WhatsApp or SMS nudge, and a reception dashboard. The durations assume one full-stack developer and are rough. Running two codebases (Next.js and .NET) adds overhead, so re-plan after Phase 1.

| Phase | Scope | Rough time | Exit gate |
| --- | --- | --- | --- |
| 0. Foundations | Repo audit and rename to BabyBlue; tokens (section 4) and the component library (section 5) with a Storybook page per component; the .NET solution and the database from the database spec; auth; seed data and canvas fixtures (6.5); CI, preview deploys and visual tests | 2 weeks | Every component passes its token test; the S4 and P7 shells pass the screenshot comparison |
| 1. Core loop | S1 to S5, the pending screen, S13; P5, P6 (with the guardian path), P7 to P9, P11, P12; queue engine; SignalR; the offline banner; the urgent review flow; SendGrid emails | 4 to 5 weeks | A staff user and a patient phone run a full visit; two devices stay in sync under network loss; a new practice can be approved or declined with a reason; all those screens pass the visual comparison |
| 2. Messaging and intake | P13 to P15, S11, the WhatsApp and SMS provider, templates, delivery webhooks, two-away and cancel triggers | 2 to 3 weeks | Messages delivered in a live test; no medical content; STOP handled; message cost per visit measured |
| 3. Patients and bookings | S6, S7, S8, S9, export and withdraw, P10, P4, the role matrix, S10 (all tabs), S12 | 3 weeks | Role-matrix and audit tests pass; the withdrawal wording is approved by counsel |
| 4. Pilot | One practice live for 2 to 4 weeks, invoiced manually: R2,000 installation, then R200 monthly (to be updated) | 2 to 4 weeks | Estimate error, adoption and message cost per practice measured; first real figures available for the P1 stat tiles (B1) |
| 5. Variants | P2 and P3 published (B2), the dentist standby list and procedure-length slots, multi-stream queues, patient-side booking (B3) | After the pilot | Build only what pilot practices ask for and will pay for |

### 13.1 Definition of done for any screen

- It matches its blueprint (sections 8 to 10) and passes the screenshot comparison (6.5) at 402px (patient) or 1320px (staff).
- It follows the documented responsive rules (9.0) below the design width.
- Every state exists: loading, empty, error, offline where relevant, and disabled (10.8).
- Keyboard and screen-reader pass: focus order, visible focus (4.5), labels, and `aria-live="polite"` on position and status changes.
- It uses only tokens and `components/ui`, with no hard-coded colours or sizes.
- The server enforces authorisation and validation; client validation is a convenience.
- It has at least one test for the happy path and the main failure.

### 13.2 Key acceptance tests

- A patient joins from a QR scan on a mid-range Android phone over a weak connection and sees their position and estimate within 3 seconds of the page loading.
- Staff press Call next. Within 2 seconds the patient's screen flips from P7 to P9, and every later position drops by one.
- A patient in airplane mode for 60 seconds keeps their position; the P8 banner appears and the state reconciles on reconnect.
- A token for visit A cannot read visit B. Staff of practice A cannot see practice B data, including over SignalR.
- Leaving the queue needs confirmation, can be repeated safely, and reorders everyone behind.
- A visit flagged Urgent does not move until an Admin approves; approving or declining without a reason is rejected.
- A pending practice cannot reach queue pages; a declined practice sees the reason and can resubmit.
- A visit for a child cannot be created without the guardian's name, relationship and phone.
- Every drawn screen passes its screenshot comparison with its canvas fixture.

---

## 14. Copy and content rules

- **Use the copy in sections 8 to 10 verbatim.** Where a drawn string contains demo data (names, times, numbers), the pattern stays and the data comes from the record.
- **Ranges:** an en dash with no spaces ("20–35 min") on screens and in WhatsApp; a hyphen in SMS ("20-35 min").
- **Times:** 24-hour "09:41". Dates: "14 Oct 2026" in lists, "Tuesday, 14 October 2026" in page subtitles, "Wed, 15 October 2026" in date fields.
- **Phone numbers:** shown in the local format "082 431 9087" and stored in E.164.
- **Large counts:** use a thin space as the thousands separator ("1 284").
- **Separators:** a middle dot with spaces (" · ") joins metadata.
- **Names:** practitioners as "Dr N. Mokoena" in patient-facing copy and "Dr Mokoena" in short references, exactly as drawn.
- **"Estimated":** the word is part of the estimate component (5.9), never typed into screen copy.
- **The patient app never shows** another patient's name, a reason for the visit, or any intake answer outside the patient's own intake screens.

---

## 15. Remaining open questions

1. **Repo tokens:** if `BabyBlueTheme.md` and `tailwind.config.ts` exist, compare them with section 4. Keep the repo values where they differ by more than the stated tolerance, and update this file.
2. **Messaging provider:** which WhatsApp and SMS provider will you use alongside SendGrid, and who owns the WhatsApp Business verification?
3. **Message costs:** how will message costs be covered at R200 per month (pass-through, an allowance, or a higher price)?
4. **Retention:** confirm the default in section 12 with a lawyer or the pilot practice, then align the S7 consent sentence (9.7).
5. **Urgent review:** confirm the reading of decision 2 in 7.4, and whether clinicians as well as admins may approve.
6. **Emergency wording:** confirm the line in A6 with the pilot practice.
7. **FAQ answers (P3):** write the four answers; the canvas draws only the questions.
8. **Final logo:** the gradient mark is a stand-in (4.6).
9. **Support address:** replace `support@babyblue.co.za` (10.5) with the real address.
10. **Landing stats (B1):** decide whether to show the drawn figures before the pilot measures real ones. This spec recommends hiding the tiles until then.
