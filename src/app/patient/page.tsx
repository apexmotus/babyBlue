"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, BadgeCheck, CalendarClock, MapPin, Search, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/app/primitives";
import { SpecialityTiles } from "@/components/front/SpecialityTiles";
import { NextAvailable, PractitionerCard, PractitionerCardSkeleton } from "@/components/patient/PractitionerCard";
import { fmtTime, relativeDay, untilText } from "@/lib/format";
import { SPECIALITY_PAGES } from "@/lib/directory";
import { searchPractitioners } from "@/lib/patient-data";
import { listCities } from "@/lib/api/public";
import { listMyAppointments } from "@/lib/api/patient";
import { useSession } from "@/local/auth";
import { useQuery } from "@/local/hooks";

export default function PatientHome() {
  const router = useRouter();
  const { session } = useSession("patient");
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const uid = session?.userId ?? null;

  const featured = useQuery(() => searchPractitioners(uid, { limit: 12 }), [uid]);
  const cities = useQuery(
    () => listCities().then((rows) => rows.map((r) => ({ city: r.name }))),
    [],
  );
  const next = useQuery(
    async () => {
      if (!uid) return null;
      const rows = await listMyAppointments(uid, "upcoming");
      return rows.sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime())[0] ?? null;
    },
    [uid],
  );
  const availableToday = (featured.data ?? []).filter((p) => p.next_available && relativeDay(p.next_available) === "Today");
  const rail = availableToday.length >= 3 ? availableToday : (featured.data ?? []).slice(0, 8);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (city) p.set("city", city);
    router.push(`/patient/search?${p.toString()}`);
  };

  return (
    <>
      <section className="pt-hero">
        <div>
        <h1>Care that <span className="acc">fits your life.</span></h1>
        <p className="lead">Find a practitioner you trust, see when they are genuinely free, and book in a few taps.</p>
        <form className="pt-search" onSubmit={go} role="search">
          <div className="a-input-wrap">
            <Search size={18} />
            <input className="a-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Speciality, service or name" aria-label="Search practitioners" />
          </div>
          <div className="a-input-wrap">
            <MapPin size={18} />
            <select
              className="a-select" style={{ paddingLeft: 42 }} value={city} onChange={(e) => setCity(e.target.value)} aria-label="City">
              <option value="">Anywhere</option>
              {(cities.data ?? []).map((c) => <option key={c.city}>{c.city}</option>)}
            </select>
          </div>
          <button className="a-btn primary lg" type="submit">Search</button>
        </form>
        <div className="f-quick" style={{ marginTop: 18 }}>
          <span>Popular</span>
          {SPECIALITY_PAGES.slice(0, 3).map((s) => (
            <Link key={s.slug} href={`/patient/search?speciality=${encodeURIComponent(s.name)}`}>{s.plural}</Link>
          ))}
        </div>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 18, color: "var(--ink-2)", fontSize: 14, fontWeight: 600 }}>
          <span style={{ display: "inline-flex", gap: 7, alignItems: "center" }}><CalendarClock size={17} color="#1d6f86" /> Real availability</span>
          <span style={{ display: "inline-flex", gap: 7, alignItems: "center" }}><BadgeCheck size={17} color="#1d6f86" /> Verified when confirmed</span>
          <span style={{ display: "inline-flex", gap: 7, alignItems: "center" }}><ShieldCheck size={17} color="#1d6f86" /> Your data stays private</span>
        </div>
        </div>
        <aside className="pt-live" aria-label="Available soon">
          <h4><i /> Available soon</h4>
          {(featured.data ?? []).slice(0, 4).map((p) => (
            <Link key={p.practitioner_id} href={`/patient/p/${p.practitioner_id}`}>
              <Avatar name={p.display_name} size={40} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block", fontFamily: "var(--font-head)", color: "var(--deep)", fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.display_name}</b>
                <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{p.speciality}</span>
              </span>
              <NextAvailable at={p.next_available} />
            </Link>
          ))}
          {featured.loading && !featured.data && [0, 1, 2].map((i) => <div key={i} className="a-skel" style={{ height: 58, borderRadius: 16 }} />)}
        </aside>
      </section>

      {next.data && (
        <section style={{ marginTop: 22 }}>
          <Link href={`/patient/appointments/${next.data.id}`} className="a-card hover" style={{ display: "flex", gap: 16, alignItems: "center", padding: "16px 20px", textDecoration: "none", color: "inherit" }}>
            <div className="pt-datebox" style={{ width: 62, padding: "8px 0", flex: "none" }}>
              <small>{relativeDay(next.data.starts_at).split(" ")[0]}</small>
              <b style={{ fontSize: 20 }}>{fmtTime(next.data.starts_at)}</b>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--info)", textTransform: "uppercase", letterSpacing: ".06em" }}>Your next appointment · {untilText(next.data.starts_at)}</p>
              <p style={{ fontFamily: "var(--font-head)", fontWeight: 800, color: "var(--deep)", fontSize: 18, marginTop: 2 }}>{next.data.service_name} with {next.data.practitioner_name}</p>
              <p style={{ color: "var(--ink-2)", fontSize: 14 }}>{next.data.practice_name}</p>
            </div>
            <ArrowRight size={20} color="#44606f" />
          </Link>
        </section>
      )}

      <div className="pt-section-h">
        <h2>Browse by speciality</h2>
      </div>
      <SpecialityTiles mode="app" reveal={false} />

      <div className="pt-section-h">
        <h2>{availableToday.length >= 3 ? "Available today" : "Next available near you"}</h2>
        <Link href="/patient/search" className="a-link">See all</Link>
      </div>
      <div className="pt-rail">
        {featured.loading && !featured.data ? [0, 1, 2].map((i) => <div key={i} style={{ width: 300 }}><PractitionerCardSkeleton /></div>) : rail.map((p) => <PractitionerCard key={p.practitioner_id} p={p} rail />)}
      </div>

      <section className="a-card pad" style={{ marginTop: 28, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 24 }}>
        {[
          [CalendarClock, "Book in a few taps", "Pick a real time from the practitioner's diary. We hold it for you while you confirm."],
          [BadgeCheck, "Verification you can see", "A badge only appears once registration has been checked. Otherwise we say so."],
          [ShieldCheck, "Private by design", "Practices only see what a booking needs. Delete your account any time."],
        ].map(([I, t, d]) => {
          const Ic = I as typeof Search;
          return (
            <div key={t as string} style={{ display: "flex", gap: 14 }}>
              <span className="a-avatar v1" style={{ ["--s" as string]: "44px", borderRadius: 14 }}><Ic size={21} /></span>
              <div><h3 style={{ fontSize: 16 }}>{t as string}</h3><p style={{ color: "var(--ink-2)", fontSize: 14, marginTop: 4 }}>{d as string}</p></div>
            </div>
          );
        })}
      </section>
    </>
  );
}
