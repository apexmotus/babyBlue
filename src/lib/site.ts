/** Central site configuration. Everything environment-specific comes from env vars (see .env.example). */
export const SITE = {
  name: "BabyBlue",
  tagline: "Care, connected.",
  description:
    "Find and book care with practitioners across South Africa, at times that suit you. Care, connected.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://babyblue-demo.vercel.app",
  /** Search engines are only invited in once the owner sets ALLOW_INDEXING=true (never on previews). */
  indexable: process.env.ALLOW_INDEXING === "true",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
} as const;

/** Patient site navigation. Nothing here may point at the practitioner side: patients should not meet it. */
export const NAV = [
  { href: "/directory", label: "Practice directory" },
  { href: "/app", label: "How it works" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

/** Practitioner site navigation (the "pro" route group). Reached from /practitioners, never linked from the patient site. */
export const PRO_NAV = [
  { href: "/os", label: "BabyBlue OS" },
  { href: "/growth", label: "Growth" },
  { href: "/flow", label: "Flow" },
  { href: "/solutions", label: "Solutions" },
  { href: "/pricing", label: "Pricing" },
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
