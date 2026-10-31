import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink, Globe, MapPin, Navigation, Phone } from "lucide-react";
import { DirectoryAttribution } from "@/components/directory/DirectoryAttribution";
import { DirectoryCard } from "@/components/directory/DirectoryCard";
import { KindIcon } from "@/components/directory/KindIcon";
import { Btn, CtaBand, Section } from "@/components/site/blocks";
import { slugify } from "@/lib/directory";
import { pageMeta } from "@/lib/meta";
import { formatPhone } from "@/lib/phone";
import { PRACTICES, SOURCE, getPractice } from "@/lib/practices/data";
import { queryPractices } from "@/lib/practices/query";
import { KIND_INFO, addressLine, hostOf, mapsUrl, osmUrl } from "@/lib/practices/types";

type Props = { params: Promise<{ id: string }> };
const find = async (params: Props["params"]) => {
  const { id } = await params;
  return /^[nwr]\d{1,12}$/.test(id) ? getPractice(id) : undefined;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await find(params);
  if (!p) return {};
  return pageMeta(p.name, `${KIND_INFO[p.kind].label} in ${p.city}, ${p.province}. Details from OpenStreetMap. Not on BabyBlue yet, so call the practice to book.`, `/directory/p/${p.id}`);
}

export default async function PracticePage({ params }: Props) {
  const p = await find(params);
  if (!p) notFound();
  const info = KIND_INFO[p.kind];
  const address = addressLine(p);
  const near = queryPractices(PRACTICES.filter((x) => x.id !== p.id), { kind: p.kind, city: slugify(p.city), pageSize: 3 }).items;

  return (
    <>
      <section className="f-listhead">
        <div className="x-container f-listhead-in">
          <nav className="f-crumbs" aria-label="Breadcrumb">
            <ol>
              <li><Link href="/">Home</Link></li>
              <li><Link href="/directory">Practice directory</Link></li>
              <li><Link href={`/directory?province=${slugify(p.province)}`}>{p.province}</Link></li>
              <li><span aria-current="page">{p.name}</span></li>
            </ol>
          </nav>
          <span className="f-kicker x-rise"><KindIcon kind={p.kind} size={14} /> {info.label}{p.speciality ? ` · ${p.speciality}` : ""}</span>
          <h1 className="f-h1 x-rise d1">{p.name}</h1>
          <p className="f-lead x-rise d2">{address || `${p.city}, ${p.province}`}</p>
          <p className="x-rise d3"><span className="f-nobb">Not on BabyBlue yet</span></p>
        </div>
      </section>

      <Section className="f-results-section" reveal={false}>
        <div className="f-profile">
          <div className="x-card f-pcard">
            <h2 className="f-h3">Contact and location</h2>
            <ul className="f-facts">
              {address && <li><MapPin size={18} aria-hidden="true" /><span>{address}<br /><small>{p.province}</small></span></li>}
              {p.phone && <li><Phone size={18} aria-hidden="true" /><a href={`tel:${p.phone}`}>{formatPhone(p.phone)}</a></li>}
              {p.website && <li><Globe size={18} aria-hidden="true" /><a href={p.website} target="_blank" rel="noopener noreferrer nofollow">{hostOf(p.website)} <ExternalLink size={13} aria-hidden="true" /></a></li>}
              {!p.phone && !p.website && <li><Phone size={18} aria-hidden="true" /><span>No phone number or website is published for this practice.</span></li>}
            </ul>
            <div className="x-btn-row" style={{ marginTop: 18 }}>
              {p.phone && <a className="x-btn x-btn-primary x-btn-sm" href={`tel:${p.phone}`}><Phone size={16} aria-hidden="true" /> Call</a>}
              <a className="x-btn x-btn-outline x-btn-sm" href={mapsUrl(p)} target="_blank" rel="noopener noreferrer"><Navigation size={16} aria-hidden="true" /> Directions</a>
            </div>
          </div>

          <div className="x-card f-pcard soft">
            <h2 className="f-h3">Booking</h2>
            <p>This practice hasn&apos;t joined BabyBlue, so there are no times to book here yet. Please call them to make an appointment.</p>
            <h2 className="f-h3" style={{ marginTop: 22 }}>Is this your practice?</h2>
            <p>Join BabyBlue to show real appointment times and take bookings. Every booking arrives marked as coming from BabyBlue.</p>
            <div className="x-btn-row" style={{ marginTop: 14 }}><Btn href="/practitioners" arrow small>See how it works</Btn></div>
          </div>
        </div>

        <div className="x-notice info" style={{ marginTop: 20 }}>
          <MapPin size={20} aria-hidden="true" />
          <div>
            <b>Something wrong or out of date?</b> Anyone can fix it at the source: <a href={osmUrl(p.id)} target="_blank" rel="noopener noreferrer">edit this practice on OpenStreetMap</a>. To ask BabyBlue to stop showing it, use the{" "}
            <Link href="/contact">contact form</Link>, choose &ldquo;Privacy request (POPIA)&rdquo; and quote <b>{p.id}</b>.
          </div>
        </div>

        {near.length > 0 && (
          <div style={{ marginTop: 48 }}>
            <h2 className="f-h3" style={{ marginBottom: 14 }}>More {info.plural.toLowerCase()} in {p.city}</h2>
            <ul className="f-dgrid">{near.map((x) => <li key={x.id}><DirectoryCard p={x} /></li>)}</ul>
            <p style={{ marginTop: 14 }}><Link className="a-link" href={`/directory?kind=${p.kind}&city=${slugify(p.city)}`}>See all {info.plural.toLowerCase()} in {p.city} <ArrowRight size={14} aria-hidden="true" style={{ verticalAlign: "-2px" }} /></Link></p>
          </div>
        )}

        <DirectoryAttribution />
        <p className="x-small">Retrieved {SOURCE.retrieved}. Reference {p.id}.</p>
      </Section>

      <CtaBand
        title="Looking for care you can book online?"
        lead="Browse practitioners on BabyBlue who show real, open appointment times."
        primary={{ href: "/patient", label: "Find care" }}
        secondary={{ href: "/directory", label: "Back to the directory" }}
      />
    </>
  );
}
