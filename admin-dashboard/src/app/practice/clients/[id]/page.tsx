"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarPlus, Mail, Phone, ShieldCheck, UserX } from "lucide-react";
import { Avatar, Badge, Btn, Empty, Field, Switch } from "@babyblue/ui/components/primitives";
import { useOs } from "@/components/os/OsContext";
import { useToast } from "@babyblue/flow-demo/components/ui";
import { fmtDayMonth, fmtTime, fmtWeekday, money, relativeDay } from "@babyblue/utils/format";
import { APPT_STATUS, loadEvents } from "@/lib/os-data";
import {
  getClient,
  grantConsent,
  listConsents,
  setClientNotes,
  updateClient,
  withdrawConsent,
} from "@babyblue/api-client/practice";
import { friendlyError } from "@babyblue/api-client/messages";
import { useQuery } from "@babyblue/pglite-demo/hooks";

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const os = useOs();
  const toast = useToast();
  const pid = os.practice?.id ?? "";
  // The old query read every column of the clients table regardless of role.
  // `practice_client_get` scopes them, and refuses outright for a client of another practice.
  const client = useQuery(() => getClient(os.uid, pid, id), [id, pid, os.uid], { enabled: !!pid });
  const consents = useQuery(() => listConsents(os.uid, pid, id), [id, pid, os.uid], { enabled: !!pid });
  const appts = useQuery(() => loadEvents(os.uid, os.practice!.id, new Date("2020-01-01"), new Date("2100-01-01"), true).then((r) => r.filter((e) => e.client_id === id).reverse()), [id, os.uid, os.practice?.id], { enabled: !!os.practice });
  const c = client.data;
  const [f, setF] = useState({ first: "", last: "", phone: "", email: "" });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (c) { setF({ first: c.first_name ?? "", last: c.last_name ?? "", phone: c.phone ?? "", email: c.email ?? "" }); setNotes(c.admin_notes ?? ""); } }, [c?.client_id, c?.admin_notes, c?.first_name, c?.last_name, c?.phone, c?.email]); // eslint-disable-line react-hooks/exhaustive-deps

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
    try {
      await updateClient(os.uid, pid, id, {
        first_name: f.first.trim(),
        last_name: f.last.trim(),
        phone: f.phone.trim() || null,
        email: f.email.trim() || null,
      });
      toast("Details saved");
    } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
  }
  /**
   * Record or withdraw consent.
   *
   * This used to overwrite a boolean and null the timestamp, which destroyed the evidence that
   * consent had ever been given — and a practice has to be able to show what it was permitted to
   * do at the time it acted (POPIA s11(3)). Granting and withdrawing now each append an event to
   * an immutable series, and the newest event is the one that governs. The toggle looks the same;
   * the record underneath no longer loses its own history.
   */
  async function consent(v: boolean) {
    try {
      if (v) await grantConsent(os.uid, pid, id, "record_storage", { captured_by: "practice_os", channel: "in_person" });
      else await withdrawConsent(os.uid, pid, id, "record_storage", "Withdrawn in the Practice OS");
      toast(v ? "Consent recorded" : "Consent withdrawn");
      consents.reload();
      client.reload();
    } catch (e) { toast(friendlyError(e)); }
  }
  async function saveNotes() {
    try { await setClientNotes(os.uid, pid, id, notes.trim() || null); toast("Notes saved"); } catch (e) { toast(friendlyError(e)); }
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
