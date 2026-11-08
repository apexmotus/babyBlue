import Link from "next/link";
import { Logo } from "@babyblue/flow-demo/components/ui";
import { SPECIALITY_PAGES } from "@/lib/directory";
import { getCities } from "@/lib/directory-facets";

type Col = { title: string; links: readonly (readonly [string, string])[] };

const LEGAL: Col = {
  title: "Company",
  links: [
    ["/about", "About"],
    ["/privacy", "Privacy policy"],
    ["/terms", "Terms of use"],
    ["/popia", "POPIA position"],
  ],
};

/** Patient site: nothing here may point at the practitioner side. */
const PATIENT_COLS: Col[] = [
  {
    title: "Find care",
    links: [...SPECIALITY_PAGES.map((s) => [`/${s.slug}`, s.plural] as const), ["/directory", "Practice directory"] as const],
  },
  {
    title: "BabyBlue",
    links: [
      ["/app", "How it works"],
      ["/patient", "Patient app (demo)"],
      ["/contact", "Contact"],
    ],
  },
  LEGAL,
];

const PRO_COLS: Col[] = [
  {
    title: "Platform",
    links: [
      ["/os", "BabyBlue OS"],
      ["/growth", "BabyBlue Growth"],
      ["/flow", "BabyBlue Flow"],
    ],
  },
  {
    title: "For practices",
    links: [
      ["/practitioners", "Overview"],
      ["/solutions", "Solutions"],
      ["/pricing", "Pricing"],
      ["/practice/login", "Practice login"],
      ["/practitioners/contact", "Talk to us"],
    ],
  },
  LEGAL,
];

export function Footer({ variant = "patient" }: { variant?: "patient" | "pro" }) {
  const pro = variant === "pro";
  const cols = pro ? PRO_COLS : PATIENT_COLS;
  return (
    <footer className="x-footer">
      <div className="x-container">
        <div className="x-foot-grid">
          <div>
            <Logo light size={38} href={pro ? "/practitioners" : "/"} />
            <p style={{ marginTop: 18, maxWidth: 320, lineHeight: 1.6 }}>
              {pro
                ? "Care, connected. Stronger practices for the practitioners who provide care."
                : "Care, connected. Better access to care, with real appointment times from the practices that offer them."}
            </p>
            <p style={{ marginTop: 18, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Starting in South Africa. Expanding across Southern Africa.</p>
            {!pro && (
              <p className="f-foot-cities">
                {getCities().map((c) => (
                  <Link key={c.slug} href={`/in/${c.slug}`}>Care in {c.name}</Link>
                ))}
              </p>
            )}
          </div>
          {cols.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <h4>{c.title}</h4>
              <ul>
                {c.links.map(([href, label]) => (
                  <li key={href}><Link href={href}>{label}</Link></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="x-foot-base">
          <span>© {new Date().getFullYear()} BabyBlue. All rights reserved.</span>
          <span style={{ maxWidth: 640 }}>
            BabyBlue connects people with independent practitioners and does not provide medical advice. In an emergency call 10177 (ambulance) or 112 from a mobile phone.
          </span>
        </div>
      </div>
    </footer>
  );
}
