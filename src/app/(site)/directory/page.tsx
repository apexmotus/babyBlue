import type { Metadata } from "next";
import Link from "next/link";
import { SearchX, X } from "lucide-react";
import { DirectoryAttribution } from "@/components/directory/DirectoryAttribution";
import { DirectoryCard } from "@/components/directory/DirectoryCard";
import { DirectorySearch } from "@/components/directory/DirectorySearch";
import { Pager } from "@/components/directory/Pager";
import { CtaBand, Section } from "@/components/site/blocks";
import { pageMeta } from "@/lib/meta";
import { PRACTICES } from "@/lib/practices/data";
import { directoryStats, isKind, queryPractices } from "@/lib/practices/query";
import { KIND_INFO } from "@/lib/practices/types";

export const metadata: Metadata = pageMeta(
  "Practice directory",
  "Find hospitals, clinics, doctors, dentists and other health practices across South Africa. Details come from OpenStreetMap, and these practices are not on BabyBlue yet.",
  "/directory",
);

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const href = (p: Record<string, string | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) sp.set(k, v);
  const qs = sp.toString();
  return `/directory${qs ? `?${qs}` : ""}`;
};

export default async function DirectoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = first(sp.q)?.trim().slice(0, 80) || undefined;
  const rawKind = first(sp.kind);
  const kind = isKind(rawKind) ? rawKind : undefined;
  const province = first(sp.province)?.slice(0, 40) || undefined;
  const city = first(sp.city)?.slice(0, 60) || undefined;
  const page = Number(first(sp.page)) || 1;

  const stats = directoryStats(PRACTICES);
  const res = queryPractices(PRACTICES, { q, kind, province, city, page });
  const filtered = !!(q || kind || province || city);
  const params = { q, kind, province, city };
  const n = (x: number) => x.toLocaleString("en-ZA");
  const provName = province ? stats.provinces.find((p) => p.slug === province)?.name ?? province : undefined;
  const cityName = city ? stats.cities.find((c) => c.slug === city)?.name ?? city : undefined;
  const active = [
    q && { label: `“${q}”`, to: href({ ...params, q: undefined }) },
    kind && { label: KIND_INFO[kind].plural, to: href({ ...params, kind: undefined }) },
    provName && { label: provName, to: href({ ...params, province: undefined }) },
    cityName && { label: cityName, to: href({ ...params, city: undefined }) },
  ].filter(Boolean) as { label: string; to: string }[];
  const from = res.total === 0 ? 0 : (res.page - 1) * 24 + 1;

  return (
    <>
      <section className="f-listhead">
        <div className="x-container f-listhead-in">
          <nav className="f-crumbs" aria-label="Breadcrumb">
            <ol>
              <li><Link href="/">Home</Link></li>
              <li><span aria-current="page">Practice directory</span></li>
            </ol>
          </nav>
          <span className="f-kicker x-rise">Practice directory</span>
          <h1 className="f-h1 x-rise d1">{filtered ? `${n(res.total)} ${res.total === 1 ? "practice" : "practices"}` : "Practices across South Africa."}</h1>
          <p className="f-lead x-rise d2">
            {stats.total > 0
              ? `${n(stats.total)} real practices, from hospitals and clinics to dentists and physiotherapists. They can't be booked on BabyBlue yet, so call to book.`
              : "The directory is being filled in batches of 100 real practices. Check back soon."}
          </p>
          <div className="x-rise d3"><DirectorySearch values={params} stats={stats} /></div>
        </div>
      </section>

      <Section className="f-results-section" reveal={false}>
        {active.length > 0 && (
          <ul className="f-chips f-active" aria-label="Active filters">
            {active.map((a) => (
              <li key={a.label}><Link className="f-chip" href={a.to}>{a.label} <X size={14} aria-label="remove filter" /></Link></li>
            ))}
            <li><Link className="f-chip" href="/directory">Clear all</Link></li>
          </ul>
        )}

        {stats.total === 0 ? null : res.total === 0 ? (
          <div className="f-empty" style={{ padding: "48px 24px", textAlign: "center" }}>
            <SearchX size={32} aria-hidden="true" />
            <h2 className="f-h3" style={{ marginTop: 12 }}>No practices match that search</h2>
            <p className="x-muted" style={{ marginTop: 6 }}>Try a shorter name, another place, or <Link href="/directory">clear the filters</Link>.</p>
          </div>
        ) : (
          <>
            <p className="f-count" role="status">
              {res.total === stats.total ? `${n(res.total)} practices` : `${n(res.total)} of ${n(stats.total)} practices`}
              <small>{from}–{Math.min(res.page * 24, res.total)} shown · most complete entries first</small>
            </p>
            <ul className="f-dgrid">
              {res.items.map((p) => <li key={p.id}><DirectoryCard p={p} /></li>)}
            </ul>
            <Pager page={res.page} pages={res.pages} params={params} />
          </>
        )}

        {!filtered && stats.total > 0 && (
          <div className="f-related" style={{ marginTop: 48 }}>
            <div>
              <h2>Browse by type</h2>
              <ul className="f-chips">{stats.kinds.map((k) => <li key={k.kind}><Link className="f-chip" href={href({ kind: k.kind })}>{KIND_INFO[k.kind].plural} <small>{n(k.count)}</small></Link></li>)}</ul>
            </div>
            <div>
              <h2>Browse by province</h2>
              <ul className="f-chips">{[...stats.provinces].sort((a, b) => a.name.localeCompare(b.name)).map((p) => <li key={p.slug}><Link className="f-chip" href={href({ province: p.slug })}>{p.name} <small>{n(p.count)}</small></Link></li>)}</ul>
            </div>
            <div>
              <h2>Busiest cities and towns</h2>
              <ul className="f-chips">{stats.cities.slice(0, 16).map((c) => <li key={c.slug}><Link className="f-chip" href={href({ city: c.slug })}>{c.name} <small>{n(c.count)}</small></Link></li>)}</ul>
            </div>
          </div>
        )}

        <DirectoryAttribution />
      </Section>

      <CtaBand
        title="Ready to book?"
        lead="Search by speciality and city to see practitioners with real, open appointment times. The demo uses fictional practices."
        primary={{ href: "/patient", label: "Find care" }}
        secondary={{ href: "/contact", label: "Contact us" }}
      />
    </>
  );
}
