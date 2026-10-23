"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarPlus, Mail, Phone, ShieldCheck, UserX } from "lucide-react";
import { Avatar, Badge, Btn, Empty, Field, Switch } from "@/components/app/primitives";
import { useOs } from "@/components/os/OsContext";
import { useToast } from "@/components/ui";
import { fmtDayMonth, fmtTime, fmtWeekday, money, relativeDay } from "@/lib/format";
import { APPT_STATUS, loadEvents, type ClientRow } from "@/lib/os-data";
import { friendlyError, mutate, query } from "@/local/db";
import { useQuery } from "@/local/hooks";

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const os = useOs();
  const toast = useToast();
  const client = useQuery(() => query<ClientRow>(os.uid, "select * from public.clients where id = $1", [id]).then((r) => r[0] ?? null), [id, os.uid]);
  const appts = useQuery(() => loadEvents(os.uid, os.practice!.id, new Date("2020-01-01"), new Date("2100-01-01"), true).then((r) => r.filter((e) => e.client_id === id).reverse()), [id, os.uid, os.practice?.id], { enabled: !!os.practice });
  const c = client.data;
  const [f, setF] = useState({ first: "", last: "", phone: "", email: "" });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (c) { setF({ first: c.first_name, last: c.last_name, phone: c.phone ?? "", email: c.email ?? "" }); setNotes(c.admin_notes ?? ""); } }, [c?.id, c?.admin_notes, c?.first_name, c?.last_name, c?.phone, c?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  if (client.loading && client.data === undefined) return <div className="a-card pad"><div className="a-skel" style={{ height: 300 }} /></div>;
  if (!c) return <div className="a-card"><Empty icon={<UserX size={28} />} title="Client not found" action={<Link href="/practice/clients" className="a-btn primary">Back to clients</Link>}>They may belong to another practice.</Empty></div>;

  const name = `${c.first_name} ${c.last_name}`.trim();
  const dirty = f.first !== c.first_name || f.last !== c.last_name || f.phone !== (c.phone ?? "") || f.email !== (c.email ?? "");
  const history = appts.data ?? [];
  const completed = history.filter((a) => a.status === "completed").length;
  const next = [...history].reverse().find((a) => ["booked", "confirmed", "checked_in"].includes(a.status) && a.starts_at.getTime() > Date.now());

  async function save() {
    if (!f.first.trim()) return toast("First name is required");
    setBusy(true);
    try { await mutate(os.uid, "update public.clients set first_name = $2, last_name = $3, phone = nullif($4, ''), email = nullif($5, '') where id = $1", [id, f.first.trim(), f.last.trim(), f.phone.trim(), f.email.trim()]); toast("Details saved"); } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
  }
  async function consent(v: boolean) {
    try { await mutate(os.uid, "update public.clients set consent_record_storage = $2, consent_at = case when $2 then now() end where id = $1", [id, v]); toast(v ? "Consent recorded" : "Consent withdrawn"); } catch (e) { toast(friendlyError(e)); }
  }
  async function saveNotes() {
    try { await mutate(os.uid, "update public.clients set admin_notes = nullif($2, '') where id = $1", [id, notes.trim()]); toast("Notes saved"); } catch (e) { toast(friendlyError(e)); }
  }

  return (
    <>
      <Link href="/practice/clients" className="a-link" style={{ display: "inline-flex", gap: 6, alignItems: "center", marginBottom: 14, fontSize: 14 }}><ArrowLeft size={16} /> All clients</Link>
      <div className="os-page-h">
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Avatar name={name} size={64} />
          <div>
            <h1 style={{ fontSize: 26 }}>{name}</h1>
            <p style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 4 }}>
              {c.phone && <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Phone size={14} /> {c.phone}</span>}
              {c.email && <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Mail size={14} /> {c.email}</span>}
              {c.user_id && <Badge tone="info">BabyBlue App user</Badge>}
            </p>
          </div>
        </div>
        <Btn className="primary" onClick={() => os.newAppointment({ clientId: id })}><CalendarPlus size={17} /> Book appointment</Btn>
      </div>

      <div className="os-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="a-card">
            <div className="os-card-h"><h2>Appointment history</h2><span className="a-hint">{completed} completed visit{completed === 1 ? "" : "s"}{next ? ` · next ${relativeDay(next.starts_at)}` : ""}</span></div>
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table className="os-table">
                <thead><tr><th>When</th><th>Service</th><th>Practitioner</th><th>Status</th><th style={{ textAlign: "right" }}>Fee</th></tr></thead>
                <tbody>
                  {history.map((a) => (
                    <tr key={a.id} className="click" onClick={() => os.openAppointment(a.id)}>
                      <td className="tnum" style={{ whiteSpace: "nowrap" }}><b style={{ color: "var(--deep)" }}>{fmtWeekday(a.starts_at)} {fmtDayMonth(a.starts_at)}</b><br /><span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{fmtTime(a.starts_at)}</span></td>
                      <td>{a.service}</td><td>{a.practitioner}</td><td><Badge tone={APPT_STATUS[a.status].tone} dot>{APPT_STATUS[a.status].label}</Badge></td><td className="tnum" style={{ textAlign: "right" }}>{money(a.price_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {history.length === 0 && !appts.loading && <Empty icon={<CalendarPlus size={26} />} title="No appointments yet">Book this client in to start their history.</Empty>}
            </div>
          </section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 style={{ fontSize: 17 }}>Contact details</h2>
            <div className="two-col" style={{ gap: 12 }}>
              <Field label="First name" htmlFor="a1"><input id="a1" className="a-input sm" value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} /></Field>
              <Field label="Last name" htmlFor="a2"><input id="a2" className="a-input sm" value={f.last} onChange={(e) => setF({ ...f, last: e.target.value })} /></Field>
              <Field label="Mobile" htmlFor="a3"><input id="a3" className="a-input sm" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
              <Field label="Email" htmlFor="a4"><input id="a4" className="a-input sm" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            </div>
            <div><Btn className="primary sm" disabled={!dirty} loading={busy} onClick={save}>Save details</Btn></div>
          </section>

          <section className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ fontSize: 17, display: "flex", gap: 8, alignItems: "center" }}><ShieldCheck size={18} color="#1d6f86" /> Consent (POPIA)</h2>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center" }}>
              <div><b style={{ color: "var(--deep)", fontSize: 14 }}>Visit records may be stored</b><p className="a-hint">{c.consent_record_storage && c.consent_at ? `Given on ${fmtDayMonth(c.consent_at)}` : "Not given. Only today's administrative details are kept."}</p></div>
              <Switch on={c.consent_record_storage} onChange={consent} label="Record storage consent" />
            </div>
          </section>

          <section className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ fontSize: 17 }}>Administrative notes</h2>
            <p className="a-hint">For reception and admin only: preferences, contact times, billing. Not a clinical record.</p>
            <textarea className="a-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Prefers morning appointments. WhatsApp, not calls." aria-label="Administrative notes" />
            <div><Btn className="secondary sm" disabled={notes.trim() === (c.admin_notes ?? "")} onClick={saveNotes}>Save notes</Btn></div>
          </section>
        </div>
      </div>
    </>
  );
}
