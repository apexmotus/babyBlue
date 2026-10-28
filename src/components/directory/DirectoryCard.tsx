import Link from "next/link";
import { Globe, MapPin, Phone } from "lucide-react";
import { formatPhone } from "@/lib/phone";
import { KIND_INFO, addressLine, hostOf, type DirectoryPractice } from "@/lib/practices/types";
import { KindIcon } from "./KindIcon";

/** A real practice from the directory. It is not on BabyBlue, so there is no booking here: the card says so and offers a call. */
export function DirectoryCard({ p }: { p: DirectoryPractice }) {
  const info = KIND_INFO[p.kind];
  const address = addressLine(p);
  return (
    <article className="f-dcard">
      <div className="f-dtop">
        <span className="f-kind" data-kind={p.kind}><KindIcon kind={p.kind} size={22} /></span>
        <div style={{ minWidth: 0 }}>
          <h3><Link href={`/directory/p/${p.id}`}>{p.name}</Link></h3>
          <p className="f-dmeta">{info.label}{p.speciality ? ` · ${p.speciality}` : ""}</p>
        </div>
      </div>
      {address && <p className="f-daddr"><MapPin size={15} aria-hidden="true" /> <span>{address}</span></p>}
      {(p.phone || p.website) && (
        <div className="f-dactions">
          {p.phone && <a className="f-dact" href={`tel:${p.phone}`}><Phone size={15} aria-hidden="true" /> {formatPhone(p.phone)}</a>}
          {p.website && <a className="f-dact" href={p.website} target="_blank" rel="noopener noreferrer nofollow"><Globe size={15} aria-hidden="true" /> {hostOf(p.website)}</a>}
        </div>
      )}
      <p className="f-dnote">Not on BabyBlue yet. Call the practice to book.</p>
    </article>
  );
}
