"use client";

import "@/styles/app.css";
import "@/styles/patient.css";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { CircleAlert, SearchX } from "lucide-react";
import { Empty, Notice } from "@/components/app/primitives";
import { PractitionerCard, PractitionerCardSkeleton } from "@/components/patient/PractitionerCard";
import { searchPractitioners } from "@/lib/patient-data";
import { useQuery } from "@/local/hooks";

type Sort = "soonest" | "price" | "name";
const SORTS: [Sort, string][] = [["soonest", "Soonest"], ["price", "Lowest fee"], ["name", "Name"]];

/**
 * Practitioners for a listing page. Results come from the BabyBlue local database (real PostgreSQL in the browser, with
 * fictional demo data), so this renders after the database starts; the page shell around it is static HTML. With a live
 * Supabase project this is the one component that would read from the server instead.
 */
export function ListingResults({ speciality, city, noun, empty, emptyBody }: { speciality?: string; city?: string; noun: string; empty: ReactNode; emptyBody?: string }) {
  const [sort, setSort] = useState<Sort>("soonest");
  const results = useQuery(() => searchPractitioners(null, { speciality, city, limit: 100 }), [speciality, city]);

  const rows = useMemo(() => {
    const r = [...(results.data ?? [])];
    if (sort === "price") r.sort((a, b) => (a.from_price_cents ?? 1e12) - (b.from_price_cents ?? 1e12));
    else if (sort === "name") r.sort((a, b) => a.display_name.localeCompare(b.display_name));
    return r;
  }, [results.data, sort]);

  return (
    <div className="f-scope">
      {results.error ? (
        <Notice tone="bad" icon={<CircleAlert size={18} />}>
          We couldn&apos;t load the demo practitioners. <button className="a-link" onClick={() => results.reload()}>Try again</button>
        </Notice>
      ) : !results.data ? (
        <div>
          <p role="status" className="f-count" style={{ marginBottom: 18 }}>
            Loading demo practitioners<small>First visit takes a few seconds while the demo database starts.</small>
          </p>
          <div className="f-grid" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i}><PractitionerCardSkeleton /></div>
            ))}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="f-empty">
          <Empty icon={<SearchX size={28} />} title={`No ${noun} on BabyBlue yet`} action={empty}>
            {emptyBody ?? "Nobody matching this page has opened a diary on BabyBlue yet. We only list practitioners who have real, bookable times."}
          </Empty>
        </div>
      ) : (
        <>
          <div className="f-resbar">
            <p className="f-count" role="status">
              {rows.length} {rows.length === 1 ? "practitioner" : "practitioners"}
              <small>Fictional demo data</small>
            </p>
            <div className="f-sort" role="group" aria-label="Sort practitioners">
              <span>Sort</span>
              {SORTS.map(([k, label]) => (
                <button key={k} type="button" className={`a-chip ${sort === k ? "on" : ""}`} aria-pressed={sort === k} onClick={() => setSort(k)}>{label}</button>
              ))}
            </div>
          </div>
          <ul className="f-grid">
            {rows.map((p, i) => (
              <li key={p.practitioner_id} className="f-in" style={{ "--i": Math.min(i, 8) } as CSSProperties}>
                <PractitionerCard p={p} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
