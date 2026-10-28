import { ChevronDown, Search } from "lucide-react";
import { KIND_INFO, KINDS } from "@/lib/practices/types";
import type { DirectoryStats } from "@/lib/practices/query";

/** A plain GET form: it works without JavaScript and every search is a shareable link. */
export function DirectorySearch({ values, stats }: { values: { q?: string; kind?: string; province?: string; city?: string }; stats: DirectoryStats }) {
  const present = new Set(stats.kinds.map((k) => k.kind));
  const byProvince = new Map<string, DirectoryStats["cities"]>();
  for (const c of stats.cities) byProvince.set(c.province, [...(byProvince.get(c.province) ?? []), c]);
  return (
    <form className="f-finder f-dirsearch" action="/directory" method="get" role="search" aria-label="Search the practice directory">
      <div className="f-field wide">
        <label htmlFor="dq">Name or place</label>
        <input id="dq" name="q" defaultValue={values.q ?? ""} maxLength={80} placeholder="e.g. Sandton, dental, Netcare" autoComplete="off" />
      </div>
      <div className="f-field">
        <label htmlFor="dk">Type</label>
        <select id="dk" name="kind" defaultValue={values.kind ?? ""}>
          <option value="">Any type</option>
          {KINDS.filter((k) => present.has(k)).map((k) => <option key={k} value={k}>{KIND_INFO[k].plural}</option>)}
        </select>
        <ChevronDown className="chev" size={18} aria-hidden="true" />
      </div>
      <div className="f-field">
        <label htmlFor="dp">Province</label>
        <select id="dp" name="province" defaultValue={values.province ?? ""}>
          <option value="">Any province</option>
          {[...stats.provinces].sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </select>
        <ChevronDown className="chev" size={18} aria-hidden="true" />
      </div>
      <div className="f-field">
        <label htmlFor="dc">City or town</label>
        <select id="dc" name="city" defaultValue={values.city ?? ""}>
          <option value="">Anywhere</option>
          {[...byProvince.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([prov, cities]) => (
            <optgroup key={prov} label={prov}>
              {[...cities].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
        <ChevronDown className="chev" size={18} aria-hidden="true" />
      </div>
      <button type="submit" className="x-btn x-btn-primary f-go"><Search size={18} aria-hidden="true" /> Search</button>
    </form>
  );
}
