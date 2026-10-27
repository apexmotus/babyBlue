import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SPECIALITY_PAGES } from "@/lib/directory";
import { Reveal } from "./Reveal";
import { SpecialityIcon } from "./SpecialityIcon";

/** Long words get a soft hyphen so they wrap cleanly in the narrow mobile tiles; the accessible name stays plain. */
const TILE_TITLE: Record<string, string> = { physiotherapy: "Physio­therapists", chiropractic: "Chiro­practors" };

/**
 * Editorial bento of the eight specialities. `public` links to the indexable listing pages; `app` stays inside the patient
 * app's search. No photography yet: tiles carry tone, type and a large line icon, so swapping in licensed photos later
 * means adding an image layer, not re-laying-out the grid (see BRAND.md).
 */
export function SpecialityTiles({ mode = "public", reveal = true }: { mode?: "public" | "app"; reveal?: boolean }) {
  return (
    <ul className="f-tiles">
      {SPECIALITY_PAGES.map((s, i) => {
        const href = mode === "public" ? `/${s.slug}` : `/patient/search?speciality=${encodeURIComponent(s.name)}`;
        const tile = (
          <Link href={href} className="f-tile" data-tone={s.tone} aria-label={`${s.plural}: ${s.blurb}`}>
            <SpecialityIcon name={s.icon} className="ico" strokeWidth={1} />
            <span className="no" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
            <span className="go" aria-hidden="true"><ArrowUpRight size={20} /></span>
            <strong>{TILE_TITLE[s.slug] ?? s.plural}</strong>
            <small>{s.blurb}</small>
          </Link>
        );
        return reveal ? (
          <Reveal as="li" key={s.slug} className={`t${i + 1}`} delay={i * 60}>{tile}</Reveal>
        ) : (
          <li key={s.slug} className={`t${i + 1}`}>{tile}</li>
        );
      })}
    </ul>
  );
}
