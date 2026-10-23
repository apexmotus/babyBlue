/** Central site configuration. Everything environment-specific comes from env vars (see .env.example). */
export const SITE = {
  name: "BabyBlue",
  tagline: "Care, connected.",
  description:
    "BabyBlue connects people with practitioners and helps practitioners attract customers, manage appointments and grow their practices. Care, connected.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://babyblue-demo.vercel.app",
  /** Search engines are only invited in once the owner sets ALLOW_INDEXING=true (never on previews). */
  indexable: process.env.ALLOW_INDEXING === "true",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
} as const;

export const NAV = [
  { href: "/app", label: "Patients" },
  { href: "/practitioners", label: "Practitioners" },
  { href: "/growth", label: "Marketing & Growth" },
  { href: "/solutions", label: "Solutions" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
] as const;

export const CATEGORIES = [
  { slug: "gp", name: "General practitioners", short: "GPs", blurb: "Everyday and family care" },
  { slug: "dentist", name: "Dentists", short: "Dentists", blurb: "Check-ups to treatment" },
  { slug: "mental", name: "Psychologists & therapists", short: "Therapists", blurb: "Counselling and mental health" },
  { slug: "physio", name: "Physiotherapists", short: "Physio", blurb: "Movement, rehab and sport" },
  { slug: "nutrition", name: "Dietitians & nutrition", short: "Nutrition", blurb: "Food, health and habits" },
  { slug: "specialist", name: "Specialists", short: "Specialists", blurb: "Referred and direct-access care" },
  { slug: "optom", name: "Optometrists", short: "Optometry", blurb: "Eye tests and eyewear" },
  { slug: "wellness", name: "Wellness & integrative", short: "Wellness", blurb: "Chiropractic, massage and more" },
] as const;
