import type { Metadata } from "next";
import "@/styles/site.css";
import "@/styles/front.css";
import { RevealController } from "@/components/front/RevealController";
import { Footer } from "@/components/site/Footer";
import { Nav } from "@/components/site/Nav";

// The practitioner side of the public site. It is deliberately not linked from the patient pages
// (see PRO_NAV in src/lib/site.ts and DECISIONS D-34); it is reached by direct address.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  description: "Tools for practices: a diary, clients, queue and marketing support in one connected platform.",
};

export default function ProLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="x-page">
      <a className="x-skip" href="#main">Skip to content</a>
      <Nav variant="pro" />
      <main id="main">{children}</main>
      <Footer variant="pro" />
      <RevealController />
    </div>
  );
}
