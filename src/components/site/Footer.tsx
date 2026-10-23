import Link from "next/link";
import { Logo } from "@/components/ui";

const COLS = [
  {
    title: "Platform",
    links: [
      ["/app", "BabyBlue App"],
      ["/os", "BabyBlue OS"],
      ["/growth", "BabyBlue Growth"],
      ["/flow", "BabyBlue Flow"],
    ],
  },
  {
    title: "Explore",
    links: [
      ["/practitioners", "For practitioners"],
      ["/solutions", "Solutions"],
      ["/pricing", "Pricing"],
      ["/waitlist", "Join the waitlist"],
    ],
  },
  {
    title: "Company",
    links: [
      ["/about", "About"],
      ["/contact", "Contact"],
      ["/privacy", "Privacy policy"],
      ["/terms", "Terms of use"],
      ["/popia", "POPIA position"],
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="x-footer">
      <div className="x-container">
        <div className="x-foot-grid">
          <div>
            <Logo light size={38} />
            <p style={{ marginTop: 18, maxWidth: 320, lineHeight: 1.6 }}>
              Care, connected. Better access to care for people, and stronger practices for the practitioners who provide it.
            </p>
            <p style={{ marginTop: 18, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Starting in South Africa. Expanding across Southern Africa.</p>
          </div>
          {COLS.map((c) => (
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
