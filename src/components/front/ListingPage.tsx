import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CtaBand, Faq, Section } from "@/components/site/blocks";
import { DirectoryAttribution } from "@/components/directory/DirectoryAttribution";
import { DirectoryCard } from "@/components/directory/DirectoryCard";
import { listingHeading, listingPath, slugify, type CityPage, type SpecialityPage } from "@/lib/directory";
import { citiesFor, getCities, getFinderData, getListedSpecialities, specialitiesIn } from "@/lib/directory-facets";
import { PRACTICES } from "@/lib/practices/data";
import { queryPractices } from "@/lib/practices/query";
import { KIND_FOR_SPECIALITY } from "@/lib/practices/types";
import { SITE } from "@/lib/site";
import { Finder } from "./Finder";
import { ListingResults } from "./ListingResults";
import { Reveal } from "./Reveal";

const FAQ = [
  ["Are the appointment times real?", "Yes. Times come straight from each practitioner's diary, and a time is held for you for five minutes while you confirm, so two people can't take the same slot."],
  ["How do I know a practitioner is verified?", "A verified badge only appears once BabyBlue has checked registration against the relevant statutory council's public register. If a profile isn't verified, it says so."],
  ["Is this real data?", "Not yet. BabyBlue is in development and this demo runs in your browser with fictional practices, so nothing on this page is a real practitioner, time or booking."],
] as const;

function intro(spec?: SpecialityPage, city?: CityPage) {
  if (spec && city) return `Compare ${spec.plural.toLowerCase()} in ${city.name} by next available time and fee. You only see times that are genuinely open, and a verified badge appears only once registration has been checked.`;
  if (spec) return `Compare ${spec.plural.toLowerCase()} by city, next available time and fee. You only see times that are genuinely open, and a verified badge appears only once registration has been checked.`;
  if (city) return `See which specialities have practitioners in ${city.name} and book a time that suits you. Different city. Same easy way to book.`;
  return "";
}

function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.label, ...(it.href ? { item: `${SITE.url}${it.href}` } : {}) })),
  };
  return (
    <nav className="f-crumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((it, i) => (
          <li key={it.label}>{it.href && i < items.length - 1 ? <Link href={it.href}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}</li>
        ))}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </nav>
  );
}

function Chips({ links, label }: { links: { href: string; label: string }[]; label: string }) {
  if (!links.length) return null;
  return (
    <div>
      <h2>{label}</h2>
      <ul className="f-chips">
        {links.map((l) => (
          <li key={l.href}><Link className="f-chip" href={l.href}>{l.label}</Link></li>
        ))}
      </ul>
    </div>
  );
}

/** Shared body of /{speciality}, /{speciality}/{city} and /in/{city}. */
export function ListingPage({ spec, city }: { spec?: SpecialityPage; city?: CityPage }) {
  const heading = listingHeading(spec, city);
  const noun = spec ? (city ? `${spec.plural.toLowerCase()} in ${city.name}` : spec.plural.toLowerCase()) : city ? `practitioners in ${city.name}` : "practitioners";

  const crumbs: { label: string; href?: string }[] = [{ label: "Home", href: "/" }];
  if (spec) crumbs.push({ label: spec.plural, href: listingPath(spec) });
  if (city) crumbs.push(spec ? { label: city.name, href: listingPath(spec, city) } : { label: `Care in ${city.name}`, href: listingPath(undefined, city) });

  // Related links only ever point at pages that have practitioners on them.
  const related: { href: string; label: string }[][] = [];
  if (spec && city) {
    related.push(citiesFor(spec).filter((c) => c.slug !== city.slug).map((c) => ({ href: listingPath(spec, c), label: `${spec.plural} in ${c.name}` })));
    related.push(specialitiesIn(city).filter((s) => s.slug !== spec.slug).map((s) => ({ href: listingPath(s, city), label: `${s.plural} in ${city.name}` })));
  } else if (spec) {
    related.push(citiesFor(spec).map((c) => ({ href: listingPath(spec, c), label: `${spec.plural} in ${c.name}` })));
    related.push(getListedSpecialities().filter((s) => s.slug !== spec.slug).map((s) => ({ href: listingPath(s), label: s.plural })));
  } else if (city) {
    related.push(specialitiesIn(city).map((s) => ({ href: listingPath(s, city), label: `${s.plural} in ${city.name}` })));
    related.push(getCities().filter((c) => c.slug !== city.slug).map((c) => ({ href: listingPath(undefined, c), label: `Care in ${c.name}` })));
  }
  const relatedLabels = spec && city ? ["Same speciality, other cities", "Other care in this city"] : spec ? ["Where to find them", "Other specialities"] : ["Specialities in this city", "Other cities"];

  // Real practices from the directory (OpenStreetMap). They are not on BabyBlue, so they sit under the bookable results.
  const dirKind = spec ? KIND_FOR_SPECIALITY[spec.slug] : undefined;
  const dir = spec && !dirKind ? { total: 0, items: [] } : queryPractices(PRACTICES, { kind: dirKind, city: city ? slugify(city.name) : undefined, pageSize: 6 });
  const dirHref = `/directory?${new URLSearchParams({ ...(dirKind ? { kind: dirKind } : {}), ...(city ? { city: slugify(city.name) } : {}) }).toString()}`;

  const emptyHref = spec ? listingPath(spec) : city ? listingPath(undefined, city) : "/patient/search";
  const emptyLabel = spec && city ? `All ${spec.plural.toLowerCase()}` : "Browse all care";

  return (
    <>
      <section className="f-listhead">
        <div className="x-container f-listhead-in">
          <Breadcrumbs items={crumbs} />
          <span className="f-kicker x-rise">{spec && city ? `${spec.name} · ${city.name}` : spec ? spec.name : city ? city.name : "Find care"}</span>
          <h1 className="f-h1 x-rise d1">{heading}</h1>
          <p className="f-lead x-rise d2">{intro(spec, city)}</p>
          <div className="x-rise d3">
            <Finder compact data={getFinderData()} initial={{ speciality: spec?.slug, city: city?.slug }} />
          </div>
        </div>
      </section>

      <Section className="f-results-section">
        <ListingResults
          speciality={spec?.name}
          city={city?.name}
          noun={noun}
          emptyBody={dir.total > 0 ? "None of them take BabyBlue bookings yet, so there are no times to show here. The real practices below are ones you can call." : undefined}
          empty={<Link className="x-btn x-btn-outline x-btn-sm" href={emptyHref}>{emptyLabel} <ArrowRight size={16} aria-hidden="true" /></Link>}
        />
        <p className="x-small" style={{ marginTop: 20 }}>
          Opening a practitioner shows their services and live times, and you only sign in when you book. BabyBlue is for booking appointments, not emergencies: in an emergency call 10177 (ambulance) or 112 from a mobile phone.
        </p>
      </Section>

      {dir.total > 0 && (
        <Section tone="white" className="f-tight">
          <div className="f-row-head">
            <div className="x-stack" style={{ ["--gap" as string]: "14px" }}>
              <span className="f-kicker">Practice directory</span>
              <h2 className="f-h2">{spec && city ? `${spec.plural} in ${city.name}` : city ? `Practices in ${city.name}` : spec ? `${spec.plural} across South Africa` : "Practices"}, <span className="acc">not on BabyBlue yet.</span></h2>
            </div>
            <p className="f-lead">Real practices from the directory. They have not joined BabyBlue, so call to book.</p>
          </div>
          <ul className="f-dgrid">{dir.items.map((p) => <li key={p.id}><DirectoryCard p={p} /></li>)}</ul>
          <p style={{ marginTop: 18 }}><Link className="a-link" href={dirHref}>See all {dir.total.toLocaleString("en-ZA")} in the directory <ArrowRight size={14} aria-hidden="true" style={{ verticalAlign: "-2px" }} /></Link></p>
          <DirectoryAttribution />
        </Section>
      )}

      {related.some((r) => r.length) && (
        <Section tone="white" className="f-tight">
          <Reveal className="f-related">
            {related.map((r, i) => (
              <Chips key={relatedLabels[i]} label={relatedLabels[i]} links={r} />
            ))}
          </Reveal>
        </Section>
      )}

      <Section className="f-tight">
        <Reveal>
          <div className="x-split">
            <div className="x-stack" style={{ ["--gap" as string]: "16px" }}>
              <span className="f-kicker">Good to know</span>
              <h2 className="f-h2">Honest about what&apos;s ready.</h2>
              <p className="f-lead">No made-up reviews, ratings or results. The people in this demo are fictional, but the times, holds and double-booking protection run on a real database.</p>
            </div>
            <Faq items={FAQ} />
          </div>
        </Reveal>
      </Section>

      <CtaBand
        title="Are you a practitioner?"
        lead="Open your diary on BabyBlue, let patients book real times, and run the practice behind it. Every practice in the demo is fictional."
        primary={{ href: "/practitioners", label: "For practitioners" }}
        secondary={{ href: "/practice/login", label: "Open BabyBlue OS" }}
      />
    </>
  );
}

