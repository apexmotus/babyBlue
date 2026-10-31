"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Clock, MapPin, Search, Users } from "lucide-react";
import { Logo } from "@/components/ui";
import { OTHER_CLINICS } from "@/lib/seed";
import { estimateFor, isOpenNow, useDB, waitingList } from "@/lib/store";

type Filter = "all" | "gp" | "dentist" | "open";

export default function Find() {
  const db = useDB();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("Rosebank");
  const waiting = waitingList(db).length;
  const rosebankOpen = isOpenNow(db);

  const clinics = useMemo(() => {
    const all = [
      {
        slug: db.settings.slug,
        name: db.settings.name,
        type: "General practice",
        kind: "gp",
        distance: "1.2 km",
        street: "Cradock Ave",
        open: rosebankOpen,
        opens: "",
        mode: "queue",
      },
      ...OTHER_CLINICS,
    ];
    return all.filter((c) => {
      if (filter === "gp" && c.kind !== "gp") return false;
      if (filter === "dentist" && c.kind !== "dentist") return false;
      if (filter === "open" && !c.open) return false;
      return true;
    });
  }, [db.settings, filter, rosebankOpen]);

  return (
    <div className="m-wrap">
      <div className="m-app">
        <div className="m-head">
          <Logo />
          <Link href="/" className="t13 muted">Home</Link>
        </div>
        <div className="m-body">
          <h1 style={{ fontSize: 24, letterSpacing: -0.5 }}>Find a clinic</h1>
          <div style={{ position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: 14, top: 16, color: "#94a3b8" }} />
            <input className="input" style={{ paddingLeft: 38 }} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search area" />
          </div>
          <div className="seg" style={{ alignSelf: "flex-start" }}>
            {([["all", "All"], ["gp", "GP"], ["dentist", "Dentist"], ["open", "Open now"]] as [Filter, string][]).map(([k, l]) => (
              <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          <p className="muted t13">{clinics.length} practice{clinics.length === 1 ? "" : "s"} near {q.trim() || "you"}, Johannesburg</p>
          {clinics.map((c) => (
            <div key={c.slug} className="card r16" style={{ padding: 18 }}>
              <div className="flex between gap8" style={{ alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ fontSize: 16 }}>{c.name}</h3>
                  <p className="muted t13" style={{ marginTop: 3 }}>
                    {c.type} · {c.distance}
                    {c.street ? ` · ${c.street}` : ""}
                  </p>
                </div>
                <span className={`pill sm ${c.open ? "good" : "neutral"}`}>{c.open ? "Open" : "Closed"}</span>
              </div>
              {c.open && c.mode === "queue" && (
                <div className="flex gap16 wrap muted t13" style={{ marginTop: 12 }}>
                  <span className="flex center gap8"><Clock size={14} /> Estimated {estimateFor(db, waiting + 1)}</span>
                  <span className="flex center gap8"><Users size={14} /> {waiting} waiting</span>
                </div>
              )}
              {c.open && c.mode === "booking" && (
                <p className="muted t13 flex center gap8" style={{ marginTop: 12 }}><Clock size={14} /> By appointment</p>
              )}
              {!c.open && "opens" in c && c.opens && <p className="muted t13" style={{ marginTop: 10 }}>{c.opens}</p>}
              <div style={{ marginTop: 14 }}>
                <Link href={`/c/${c.slug}`} className={`btn block ${c.open ? "btn-primary" : "btn-secondary"}`}>
                  {c.open ? (c.mode === "booking" ? "Request a booking" : "Join the queue") : "View clinic"}
                </Link>
              </div>
            </div>
          ))}
          <p className="hint flex center gap8"><MapPin size={14} /> Demo: only Rosebank Family Practice has a live queue.</p>
        </div>
      </div>
    </div>
  );
}
