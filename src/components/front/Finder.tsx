"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { FinderData } from "@/lib/directory";

/**
 * Speciality + city finder. It routes to the public listing pages (/{speciality}, /{speciality}/{city}, /in/{city}) and
 * only offers cities that have listed practitioners for the chosen speciality, so a choice never lands on an empty page.
 */
export function Finder({ data, initial, compact }: { data: FinderData; initial?: { speciality?: string; city?: string }; compact?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [spec, setSpec] = useState(initial?.speciality ?? "");
  const [cityState, setCity] = useState(initial?.city ?? "");

  const cities = useMemo(() => {
    const list = spec ? data.cities.filter((c) => data.pairs.includes(`${spec}/${c.slug}`)) : data.cities;
    // Keep the page's own city selectable even when the page is an empty combination, so the control reflects where you are.
    const keep = initial?.city && spec === initial.speciality ? data.cities.find((c) => c.slug === initial.city) : undefined;
    return keep && !list.includes(keep) ? [...list, keep] : list;
  }, [data, spec, initial]);
  const city = cities.some((c) => c.slug === cityState) ? cityState : "";

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(spec && city ? `/${spec}/${city}` : spec ? `/${spec}` : city ? `/in/${city}` : "/patient/search");
  };

  return (
    <form className={`f-finder ${compact ? "compact" : ""}`} role="search" aria-label="Find care" onSubmit={go}>
      <div className="f-field">
        <label htmlFor={`${id}-spec`}>Looking for</label>
        <select id={`${id}-spec`} value={spec} onChange={(e) => setSpec(e.target.value)}>
          <option value="">Any speciality</option>
          {data.specialities.map((s) => (
            <option key={s.slug} value={s.slug}>{s.name}</option>
          ))}
        </select>
        <ChevronDown className="chev" size={18} aria-hidden="true" />
      </div>
      <div className="f-field">
        <label htmlFor={`${id}-city`}>Where</label>
        <select id={`${id}-city`} value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">Any city</option>
          {cities.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
        <ChevronDown className="chev" size={18} aria-hidden="true" />
      </div>
      <button type="submit" className="x-btn x-btn-primary f-go">
        <Search size={18} aria-hidden="true" /> Find care
      </button>
    </form>
  );
}
