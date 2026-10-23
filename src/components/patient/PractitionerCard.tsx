"use client";

import Link from "next/link";
import { BadgeCheck, CalendarClock, Clock, MapPin } from "lucide-react";
import { Avatar } from "@/components/app/primitives";
import { fmtTime, money, relativeDay } from "@/lib/format";
import type { SearchRow } from "@/lib/patient-data";

export function VerifiedBadge({ status }: { status: SearchRow["verification_status"] }) {
  if (status === "verified")
    return (
      <span className="pt-verified" title="BabyBlue checked this practitioner's registration against the relevant council's public register.">
        <BadgeCheck size={14} /> Verified
      </span>
    );
  return (
    <span className="pt-unverified" title={status === "pending" ? "Registration submitted and awaiting review." : "BabyBlue has not verified this registration yet."}>
      {status === "pending" ? "Verification pending" : "Not yet verified"}
    </span>
  );
}

export function NextAvailable({ at }: { at: Date | null }) {
  if (!at) return <span className="pt-next none"><Clock size={13} /> No times in 14 days</span>;
  return (
    <span className="pt-next">
      <CalendarClock size={13} /> {relativeDay(at)} · {fmtTime(at)}
    </span>
  );
}

export function PractitionerCard({ p, rail }: { p: SearchRow; rail?: boolean }) {
  return (
    <Link href={`/patient/p/${p.practitioner_id}`} className={`a-card hover pt-prac ${rail ? "rail" : ""}`} aria-label={`${p.display_name}, ${p.speciality}`}>
      <div className="pt-prac-top">
        <Avatar name={p.display_name} size={56} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3>
            {p.display_name} <VerifiedBadge status={p.verification_status} />
          </h3>
          <p className="meta">{p.title ?? p.speciality}</p>
          <p className="meta" style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <MapPin size={13} /> {p.practice_name}, {p.city}
          </p>
        </div>
      </div>
      {!rail && p.bio && (
        <p style={{ color: "var(--ink-2)", fontSize: 14, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.bio}</p>
      )}
      <div className="pt-tags">
        {p.languages.slice(0, 3).map((l) => <span key={l} className="pt-tag">{l}</span>)}
      </div>
      <div className="pt-prac-foot">
        <NextAvailable at={p.next_available} />
        <span style={{ color: "var(--ink-2)", fontWeight: 600 }}>{p.from_price_cents != null ? `from ${money(p.from_price_cents)}` : ""}</span>
      </div>
    </Link>
  );
}

export function PractitionerCardSkeleton() {
  return (
    <div className="a-card pt-prac" aria-hidden="true">
      <div className="pt-prac-top">
        <div className="a-skel" style={{ width: 56, height: 56, borderRadius: 28 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="a-skel" style={{ height: 18, width: "60%" }} />
          <div className="a-skel" style={{ height: 13, width: "40%" }} />
          <div className="a-skel" style={{ height: 13, width: "55%" }} />
        </div>
      </div>
      <div className="a-skel" style={{ height: 14 }} />
      <div className="a-skel" style={{ height: 14, width: "70%" }} />
    </div>
  );
}
