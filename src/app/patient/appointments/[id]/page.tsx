"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, CalendarPlus, Check, CircleSlash, Download, Info, MapPin, Navigation, QrCode, RefreshCcw, UserCheck } from "lucide-react";
import { Avatar, Badge, Btn, Empty, Field, Notice, Sheet } from "@/components/app/primitives";
import { RequireAuth } from "@/components/patient/RequireAuth";
import { SlotPicker } from "@/components/patient/SlotPicker";
import { useToast } from "@/components/ui";
import { STATUS_UI, type MyAppt } from "@/lib/appt";
import { downloadText, fmtLongDate, fmtTime, icsFor, money, untilText } from "@/lib/format";
import { friendlyError, mutate, query } from "@/local/db";
import { useSession } from "@/local/auth";
import { useQuery } from "@/local/hooks";

export default function Page() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <Detail />
      </Suspense>
    </RequireAuth>
  );
}

const REASONS = ["Something came up", "I found another time", "I'm feeling better", "Booked by mistake", "Other"];
type Appt = MyAppt & { service_id: string };

function Detail() {
  const { id } = useParams<{ id: string }>();
  const booked = useSearchParams().get("booked") === "1";
  const toast = useToast();
  const { session } = useSession("patient");
  const uid = session!.userId;
  const [sheet, setSheet] = useState<"cancel" | "resched" | null>(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState("");

  const q = useQuery(
    async () => {
      const [a] = await query<Appt>(uid, "select m.*, a.service_id from public.my_appointments() m join public.appointments a on a.id = m.id where m.id = $1", [id]);
      return a ?? null;
    },
    [uid, id],
    { poll: 10000 },
  );
  const a = q.data;

  useEffect(() => {
    if (a) QRCode.toDataURL(a.id, { margin: 1, width: 220, color: { dark: "#14364b", light: "#ffffff" } }).then(setQr, () => setQr(""));
  }, [a?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.loading && q.data === undefined) return <div style={{ maxWidth: 680, margin: "0 auto" }}><div className="a-card pad"><div className="a-skel" style={{ height: 380 }} /></div></div>;
  if (!a)
    return (
      <div className="a-card" style={{ maxWidth: 680, margin: "0 auto" }}>
        <Empty icon={<CircleSlash size={28} />} title="Appointment not found" action={<Link href="/patient/appointments" className="a-btn primary">Back to appointments</Link>}>It may belong to a different account.</Empty>
      </div>
    );

  const ui = STATUS_UI[a.status] ?? STATUS_UI.booked;
  const active = ["booked", "confirmed"].includes(a.status) && a.ends_at.getTime() > Date.now();
  const canCheckIn = active && a.starts_at.getTime() - Date.now() < 2 * 3600_000;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${a.practice_name} ${a.address ?? ""} ${a.city ?? ""}`)}`;
  const ics = () =>
    downloadText("babyblue-appointment.ics", "text/calendar", icsFor({ id: a.id, title: `${a.service_name} · ${a.practitioner_name}`, start: a.starts_at, end: a.ends_at, location: `${a.practice_name}, ${a.address ?? ""}, ${a.city ?? ""}` }));
  const steps = [
    { t: "Booked", d: "Your time is confirmed with the practice.", done: true, now: false },
    { t: "Check in", d: "Tap “I've arrived” within 2 hours of your time, or show your code at reception.", done: ["checked_in", "in_progress", "completed"].includes(a.status), now: canCheckIn },
    { t: "Seen by the practitioner", d: "Your consultation.", done: ["in_progress", "completed"].includes(a.status), now: a.status === "in_progress" },
    { t: "Completed", d: "That's it. You can rebook any time.", done: a.status === "completed", now: false },
  ];

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast(ok);
      setSheet(null);
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <Link href="/patient/appointments" className="a-link" style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 14 }}><ArrowLeft size={16} /> All appointments</Link>

      {booked && (
        <div className="a-card pad" style={{ textAlign: "center", background: "linear-gradient(160deg,#eaf6f0,#e6f3f7)", border: 0, padding: "34px 24px" }}>
          <div className="pt-success-ic"><Check size={46} strokeWidth={3} /></div>
          <h1 style={{ fontSize: 30, marginTop: 18 }}>You&apos;re booked.</h1>
          <p style={{ color: "var(--ink-2)", marginTop: 6 }}>
            {a.service_name} with {a.practitioner_name}<br />
            <b style={{ color: "var(--deep)" }}>{fmtLongDate(a.starts_at)} at {fmtTime(a.starts_at)}</b>
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 18 }}>
            <button className="a-btn primary" onClick={ics}><CalendarPlus size={18} /> Add to calendar</button>
            <a className="a-btn secondary" href={maps} target="_blank" rel="noreferrer"><Navigation size={18} /> Directions</a>
          </div>
        </div>
      )}

      <section className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <Avatar name={a.practitioner_name} size={58} />
            <div>
              <Link href={`/patient/p/${a.practitioner_id}`} style={{ textDecoration: "none" }}><h2 style={{ fontSize: 20 }}>{a.practitioner_name}</h2></Link>
              <p style={{ color: "var(--ink-2)", fontSize: 14.5 }}>{a.speciality}</p>
            </div>
          </div>
          <Badge tone={ui.tone} dot>{ui.label}</Badge>
        </div>
        <hr className="a-divider" />
        <dl className="a-kv">
          <dt>Service</dt><dd>{a.service_name}</dd>
          <dt>When</dt>
          <dd>{fmtLongDate(a.starts_at)}<br /><span className="tnum" style={{ color: "var(--ink-2)", fontWeight: 500 }}>{fmtTime(a.starts_at)} – {fmtTime(a.ends_at)}{active ? ` · ${untilText(a.starts_at)}` : ""}</span></dd>
          <dt>Where</dt>
          <dd style={{ fontWeight: 500 }}>{a.practice_name}<br /><span style={{ color: "var(--ink-2)" }}>{a.address}, {a.city}</span></dd>
          <dt>Fee</dt><dd className="tnum">{money(a.price_cents)}</dd>
          <dt>Booking ref</dt><dd style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{a.id.slice(0, 8).toUpperCase()}</dd>
        </dl>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="a-btn secondary sm" href={maps} target="_blank" rel="noreferrer"><MapPin size={16} /> Directions</a>
          <button className="a-btn secondary sm" onClick={ics}><Download size={16} /> Add to calendar</button>
        </div>
      </section>

      {canCheckIn && (
        <section className="a-card pad" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", background: "linear-gradient(135deg,#eaf6f0,#e6f3f7)", border: 0 }}>
          <UserCheck size={30} color="#2b7557" />
          <div style={{ flex: 1, minWidth: 200 }}>
            <h3 style={{ fontSize: 18 }}>Arrived at the practice?</h3>
            <p style={{ color: "var(--ink-2)", fontSize: 14 }}>Let reception know you&apos;re here. You&apos;ll join today&apos;s queue.</p>
          </div>
          <Btn className="primary" loading={busy} onClick={() => run(() => mutate(uid, "select public.check_in_appointment($1)", [id]), "You're checked in")}>I&apos;ve arrived</Btn>
        </section>
      )}

      {a.status === "checked_in" && <Notice tone="good" icon={<Check size={18} />}>You&apos;re checked in. Reception knows you&apos;re here, and you&apos;ll be called through shortly.</Notice>}

      {(active || a.status === "checked_in") && (
        <section className="a-card pad pt-qr" style={{ border: 0, flexWrap: "wrap" }}>
          {qr ? <img src={qr} alt="Check-in code for this appointment" width={110} height={110} /> : <QrCode size={110} />}
          <div style={{ flex: 1, minWidth: 180 }}>
            <h3 style={{ fontSize: 17 }}>Your check-in code</h3>
            <p style={{ color: "var(--ink-2)", fontSize: 14, marginTop: 3 }}>Show this at reception for a faster check-in.</p>
          </div>
        </section>
      )}

      <section className="a-card pad">
        <h2 style={{ fontSize: 18, marginBottom: 14 }}>Your visit</h2>
        <div className="pt-timeline">
          {steps.map((s) => (
            <div key={s.t} className={`pt-tl ${s.done ? "done" : ""} ${s.now ? "now" : ""}`}>
              <span className="d" />
              <div><b style={{ color: "var(--deep)" }}>{s.t}</b><p style={{ color: "var(--ink-2)", fontSize: 14 }}>{s.d}</p></div>
            </div>
          ))}
        </div>
      </section>

      {active && (
        <section className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ fontSize: 18 }}>Need to change something?</h2>
          {!a.can_cancel && <Notice tone="warn" icon={<Info size={18} />}>This is inside the practice&apos;s {a.cancellation_notice_hours}-hour change window, so it can&apos;t be changed online. Please contact the practice.</Notice>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="a-btn secondary" disabled={!a.can_cancel} onClick={() => setSheet("resched")}><RefreshCcw size={17} /> Reschedule</button>
            <button className="a-btn danger" disabled={!a.can_cancel} onClick={() => setSheet("cancel")}>Cancel appointment</button>
          </div>
          <p className="a-hint">Free changes up to {a.cancellation_notice_hours} hours before your appointment.</p>
        </section>
      )}

      {sheet === "cancel" && <CancelSheet onClose={() => setSheet(null)} busy={busy} onConfirm={(reason) => run(() => mutate(uid, "select public.cancel_appointment($1, $2)", [id, reason]), "Appointment cancelled")} />}
      {sheet === "resched" && <ReschedSheet a={a} uid={uid} busy={busy} onClose={() => setSheet(null)} onConfirm={(iso) => run(() => mutate(uid, "select public.reschedule_appointment($1, $2::timestamptz)", [id, iso]), "Appointment moved")} />}
    </div>
  );
}

function CancelSheet({ onClose, onConfirm, busy }: { onClose: () => void; onConfirm: (reason: string) => void; busy: boolean }) {
  const [reason, setReason] = useState(REASONS[0]);
  return (
    <Sheet
      title="Cancel this appointment?"
      sub="The time will be released for other patients."
      onClose={onClose}
      size="narrow"
      footer={<><button className="a-btn ghost" onClick={onClose}>Keep it</button><Btn className="danger-solid" loading={busy} onClick={() => onConfirm(reason)}>Cancel appointment</Btn></>}
    >
      <Field label="Reason (optional)" htmlFor="reason">
        <select id="reason" className="a-select" value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
      </Field>
    </Sheet>
  );
}

function ReschedSheet({ a, uid, onClose, onConfirm, busy }: { a: Appt; uid: string; onClose: () => void; onConfirm: (iso: string) => void; busy: boolean }) {
  const [slot, setSlot] = useState<string | null>(null);
  return (
    <Sheet
      title="Choose a new time"
      sub={`${a.service_name} with ${a.practitioner_name}`}
      onClose={onClose}
      footer={<><button className="a-btn ghost" onClick={onClose}>Back</button><Btn className="primary" disabled={!slot} loading={busy} onClick={() => slot && onConfirm(slot)}>Move appointment</Btn></>}
    >
      <SlotPicker userId={uid} practitionerId={a.practitioner_id} serviceId={a.service_id} value={slot} onChange={setSlot} />
    </Sheet>
  );
}
