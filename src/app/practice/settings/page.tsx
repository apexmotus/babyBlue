"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Btn, Field, Notice } from "@/components/app/primitives";
import { OwnerOnly } from "@/components/os/OwnerOnly";
import { useOs } from "@/components/os/OsContext";
import { useToast } from "@/components/ui";
import { friendlyError, mutate, query } from "@/local/db";
import { useQuery } from "@/local/hooks";

const PROVINCES = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"];

export default function SettingsPage() {
  return <OwnerOnly><Settings /></OwnerOnly>;
}

function Settings() {
  const os = useOs();
  const toast = useToast();
  const p = os.practice!;
  const loc = useQuery(() => query<{ id: string; address: string | null; city: string | null }>(os.uid, "select id, address, city from public.locations where practice_id = $1 order by name limit 1", [p.id]).then((r) => r[0] ?? null), [p.id, os.uid]);
  const [f, setF] = useState({ name: p.name, province: p.province ?? "", notice: String(p.min_notice_minutes), cancel: String(p.cancellation_notice_hours), address: "", city: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (loc.data) setF((x) => ({ ...x, address: loc.data!.address ?? "", city: loc.data!.city ?? "" })); }, [loc.data]);

  async function save() {
    const notice = Number(f.notice), cancel = Number(f.cancel);
    if (f.name.trim().length < 2) return toast("Enter the practice name");
    if (!(notice >= 0) || !(cancel >= 0)) return toast("Notice periods must be zero or more");
    setBusy(true);
    try {
      await mutate(os.uid, "update public.practices set name = $2, province = nullif($3, ''), min_notice_minutes = $4, cancellation_notice_hours = $5 where id = $1", [p.id, f.name.trim(), f.province, notice, cancel]);
      if (loc.data) await mutate(os.uid, "update public.locations set address = nullif($2, ''), city = nullif($3, ''), province = nullif($4, '') where id = $1", [loc.data.id, f.address.trim(), f.city.trim(), f.province]);
      else await mutate(os.uid, "insert into public.locations (practice_id, name, address, city, province) values ($1, 'Main rooms', nullif($2, ''), nullif($3, ''), nullif($4, ''))", [p.id, f.address.trim(), f.city.trim(), f.province]);
      toast("Settings saved");
    } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="os-page-h"><div><h1>Settings</h1><p>Practice details and booking rules.</p></div></div>
      <div className="os-grid even" style={{ gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)" }}>
        <section className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ fontSize: 18 }}>Practice details</h2>
          <Field label="Practice name" htmlFor="n"><input id="n" className="a-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="two-col" style={{ gap: 14 }}>
            <Field label="Street address" htmlFor="a"><input id="a" className="a-input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
            <Field label="City" htmlFor="c"><input id="c" className="a-input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
          </div>
          <Field label="Province" htmlFor="pr"><select id="pr" className="a-select" value={f.province} onChange={(e) => setF({ ...f, province: e.target.value })}><option value="">Select…</option>{PROVINCES.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <hr className="a-divider" />
          <h2 style={{ fontSize: 18 }}>Booking rules</h2>
          <div className="two-col" style={{ gap: 14 }}>
            <Field label="Minimum notice to book (minutes)" htmlFor="mn" hint="Patients can't book a time sooner than this."><input id="mn" type="number" min={0} step={15} className="a-input" value={f.notice} onChange={(e) => setF({ ...f, notice: e.target.value })} /></Field>
            <Field label="Free cancellation window (hours)" htmlFor="cw" hint="Patients can cancel or move online until this long before."><input id="cw" type="number" min={0} step={1} className="a-input" value={f.cancel} onChange={(e) => setF({ ...f, cancel: e.target.value })} /></Field>
          </div>
          <div><Btn className="primary" loading={busy} onClick={save}>Save settings</Btn></div>
        </section>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <section className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 style={{ fontSize: 18 }}>Status</h2>
            <p style={{ color: "var(--ink-2)" }}>{p.status === "active" ? "Your practice is live. Listed practitioners can be found and booked." : p.status === "pending" ? "Your practice is awaiting activation." : "Your practice is suspended."}</p>
            <p className="a-hint">Web address: <code>/patient/join/{p.slug}</code></p>
          </section>
          <section className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 style={{ fontSize: 18 }}>Privacy & data</h2>
            <Notice tone="info">Each practice&apos;s data is kept separate from every other practice, access is role-based, and client health information is never used to target marketing. See the <Link href="/popia" target="_blank">POPIA position</Link>.</Notice>
          </section>
        </div>
      </div>
    </>
  );
}
