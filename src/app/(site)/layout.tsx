import "./site.css";
import { Footer } from "@/components/site/Footer";
import { Nav } from "@/components/site/Nav";
import { SITE } from "@/lib/site";

const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE.name,
  slogan: SITE.tagline,
  url: SITE.url,
  description: SITE.description,
  areaServed: "ZA",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="x-page">
      <a className="x-skip" href="#main">Skip to content</a>
      <Nav />
      <main id="main">{children}</main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }} />
    </div>
  );
}
