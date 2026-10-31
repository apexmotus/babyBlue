# BRAND

**BabyBlue — Care, connected.**

## Positioning
- Brand: *Care, connected.*
- Consumers: *Care that fits your life.* · *Your next appointment, a few taps away.* · *Different city. Same easy way to book.*
- Practitioners: *More time for your practice. More room to grow.*
- Growth: *You take care of your patients. We'll help you take care of business.* · *You're an expert in your practice. You shouldn't have to be an expert in marketing, too.*
- Homepage: *Better access to care. Stronger practices.*

## Product family
BabyBlue **App** (consumers) · **OS** (practice management) · **Growth** (marketing services) · **Flow** (queue and check-in).

## Colour
| Token | Hex | Use |
|---|---|---|
| Deep Blue `--deep` | `#14364B` | Primary text, buttons, dark sections |
| Connected Blue `--connected` | `#3097B2` | Accents, large headings, icons, charts |
| Sky Blue `--sky` | `#BDE6EF` | Soft fills, highlights |
| Cloud White `--cloud` | `#F5F8F6` | Page background |
| Sage Green `--sage` | `#8BC5A9` | Positive/secondary accent |
| White | `#FFFFFF` | Surfaces |
| Link Blue `--link` | `#1D6F86` | Text-safe Connected Blue (5.7:1 on white) |

**Contrast rule:** Connected Blue (3.4:1 on white) is for large text (≥24px or ≥18.7px bold), graphics and icons only. Small text uses Deep Blue, ink greys or Link Blue. White-on-Connected-Blue is not used for small text.

## Typography
Manrope (headings, 500–800, tight tracking −0.03em) · Inter (UI and body, 400–700). Loaded with `next/font` (self-hosted, no layout shift).

## Wordmark
Lowercase `babyblue.` set in Manrope ExtraBold; "blue" and the full stop in Connected Blue (Sky Blue on dark). Component: `Logo` in `src/components/ui.tsx`. A formal logo file should replace this when designed.

## Voice
Warm, clear, calm, specific. Plain English. No hype, no fear. Say what is ready and what isn't. Never promise outcomes, never imply clinical advice.

## Don't
- Claim the app is downloadable before it is (no store badges).
- Show fabricated reviews, ratings, revenue, user counts or "trusted by" logos.
- Show real-looking practitioner faces or names as if they were real.
- Use cartoon illustration, heavy gradients or stock "medical" clichés (stethoscope-on-blue).

## Photography brief (to be commissioned)
Authentic South African people in everyday and practice settings: diverse ages, languages and body types; natural light; candid not posed; phones shown in use, practitioners mid-work rather than staring at camera. Obtain model releases; for practitioner portraits use the real practitioner. Replace each `PhotoSlot` in `src/components/site/blocks.tsx` usages with `next/image` and meaningful alt text. Slots and briefs currently live on: home hero (the `f-stage` panel), home persona cards, `/app`, `/practitioners`, `/about`. The speciality tiles carry tone and a line icon today; add an image layer inside `SpecialityTiles` when photos exist.
