"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, MapPin, Search, SearchX, SlidersHorizontal, X } from "lucide-react";
import { Empty, Field, Sheet, Switch } from "@/components/app/primitives";
import { PractitionerCard, PractitionerCardSkeleton } from "@/components/patient/PractitionerCard";
import { SPECIALITIES, searchPractitioners } from "@/lib/patient-data";
import { query } from "@/local/db";
import { useQuery } from "@/local/hooks";
import { useSession } from "@/local/auth";

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchInner />
    </Suspense>
  );
}

type Sort = "soonest" | "price" | "name";

function SearchInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { session } = useSession("patient");
  const uid = session?.userId ?? null;
  const q = params.get("q") ?? "";
  const speciality = params.get("speciality") ?? "";
  const city = params.get("city") ?? "";
  const verified = params.get("verified") === "1";
  const sort = (params.get("sort") as Sort) || "soonest";
  const [draft, setDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const set = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    router.replace(`/patient/search?${p.toString()}`, { scroll: false });
  };

  const results = useQuery(() => searchPractitioners(uid, { q, speciality, city, verifiedOnly: verified }), [uid, q, speciality, city, verified]);
  const cities = useQuery(() => query<{ city: string }>(null, "select distinct l.city from public.locations l join public.practices p on p.id = l.practice_id where l.city is not null order by 1"), []);
  const specs = useQuery(() => query<{ speciality: string; n: number }>(null, "select speciality, count(*)::int n from public.practitioners where listing_status = 'listed' group by 1 order by 1"), []);

  const rows = useMemo(() => {
    const r = [...(results.data ?? [])];
    if (sort === "price") r.sort((a, b) => (a.from_price_cents ?? 1e12) - (b.from_price_cents ?? 1e12));
    else if (sort === "name") r.sort((a, b) => a.display_name.localeCompare(b.display_name));
    return r;
  }, [results.data, sort]);

  const active = [q && `“${q}”`, speciality, city, verified && "Verified only"].filter(Boolean) as string[];
  const clear = () => router.replace("/patient/search");

  const Filters = (
    <>
      <div>
        <p className="a-label" style={{ marginBottom: 10 }}>Speciality</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button className={`a-chip ${!speciality ? "on" : ""}`} style={{ justifyContent: "flex-start" }} onClick={() => set({ speciality: null })} aria-pressed={!speciality}>All specialities</button>
          {(specs.data ?? []).map((s) => (
            <button key={s.speciality} className={`a-chip ${speciality === s.speciality ? "on" : ""}`} style={{ justifyContent: "space-between" }} onClick={() => set({ speciality: s.speciality })} aria-pressed={speciality === s.speciality}>
              <span>{s.speciality}</span><span style={{ opacity: 0.6, fontSize: 12.5 }}>{s.n}</span>
            </button>
          ))}
        </div>
      </div>
      <Field label="City" htmlFor="f-city">
        <select id="f-city" className="a-select" value={city} onChange={(e) => set({ city: e.target.value || null })}>
          <option value="">Anywhere</option>
          {(cities.data ?? []).map((c) => <option key={c.city}>{c.city}</option>)}
        </select>
      </Field>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <p className="a-label" style={{ display: "flex", gap: 6, alignItems: "center" }}><BadgeCheck size={16} color="#1d6f86" /> Verified only</p>
          <p className="a-hint">Registration checked by BabyBlue</p>
        </div>
        <Switch on={verified} onChange={(v) => set({ verified: v ? "1" : null })} label="Verified only" />
      </div>
      <Field label="Sort by" htmlFor="f-sort">
        <select id="f-sort" className="a-select" value={sort} onChange={(e) => set({ sort: e.target.value === "soonest" ? null : e.target.value })}>
          <option value="soonest">Soonest available</option>
          <option value="price">Lowest fee</option>
          <option value="name">Name A–Z</option>
        </select>
      </Field>
    </>
  );

  return (
    <>
      <form
        onSubmit={(e) => { e.preventDefault(); set({ q: draft.trim() || null }); }}
        role="search"
        style={{ display: "flex", gap: 10, marginBottom: 20 }}
      >
        <div className="a-input-wrap" style={{ flex: 1 }}>
          <Search size={18} />
          <input className="a-input" style={{ height: 52, borderRadius: 16 }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search speciality, service or name" aria-label="Search practitioners" />
        </div>
        <button className="a-btn primary" style={{ height: 52, borderRadius: 16 }} type="submit">Search</button>
      </form>

      <div className="pt-filterbar" role="group" aria-label="Quick filters">
        <button className="a-chip" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={15} /> Filters{active.length ? ` · ${active.length}` : ""}</button>
        {SPECIALITIES.slice(0, 6).map((s) => (
          <button key={s.name} className="a-chip" aria-pressed={speciality === s.name} onClick={() => set({ speciality: speciality === s.name ? null : s.name })}>{s.name}</button>
        ))}
      </div>

      <div className="pt-search-layout">
        <aside className="a-card pt-filters" aria-label="Filters">{Filters}</aside>
        <section aria-live="polite">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <h1 style={{ fontSize: 22 }}>{results.loading && !results.data ? "Searching…" : `${rows.length} practitioner${rows.length === 1 ? "" : "s"}`}{speciality ? ` · ${speciality}` : ""}</h1>
            {active.map((a) => <span key={a} className="a-badge info">{a}</span>)}
            {active.length > 0 && <button className="a-link" onClick={clear} style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 14 }}><X size={14} /> Clear</button>}
          </div>
          <div className="pt-results">
            {results.loading && !results.data && [0, 1, 2].map((i) => <PractitionerCardSkeleton key={i} />)}
            {rows.map((p) => <PractitionerCard key={p.practitioner_id} p={p} />)}
            {!results.loading && rows.length === 0 && (
              <div className="a-card">
                <Empty icon={<SearchX size={28} />} title="No practitioners match" action={<button className="a-btn primary" onClick={clear}>Clear filters</button>}>
                  Try a broader search, another city, or remove the verified-only filter.
                </Empty>
              </div>
            )}
          </div>
          <p className="a-hint" style={{ marginTop: 22, display: "flex", gap: 6, alignItems: "center" }}><MapPin size={14} /> Demo data: every practitioner shown here is fictional.</p>
        </section>
      </div>

      {filtersOpen && (
        <Sheet title="Filters" onClose={() => setFiltersOpen(false)} footer={<button className="a-btn primary block" onClick={() => setFiltersOpen(false)}>Show {rows.length} result{rows.length === 1 ? "" : "s"}</button>}>
          {Filters}
        </Sheet>
      )}
    </>
  );
}
