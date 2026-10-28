"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Ban, CalendarClock, CircleCheck, DoorOpen, Mail, MessageCircle, Phone, Play, RotateCcw, UserX } from "lucide-react";
import { formatPhone, parsePhone, whatsappLink } from "@/lib/phone";
import { Avatar, Badge, Btn, Drawer, Field, Notice } from "@/components/app/primitives";
import { useOs } from "@/components/os/OsContext";
import { useToast } from "@/components/ui";
import { atTime, dayKey, fmtLongDate, fmtTime, money, relativeDay, todayKey } from "@/lib/format";
import { BabyBlueTag } from "@/components/os/BabyBlueTag";
import { APPT_STATUS, SOURCE_LABEL, isBabyBlue, type Ev } from "@/lib/os-data";
import { friendlyError, mutate, query } from "@/local/db";
import { useQuery } from "@/local/hooks";

const REASONS = ["Patient asked to cancel", "Practitioner unavailable", "Double booking", "Duplicate", "Other"];

export function AppointmentDrawer() {
  const { apptId, closeAppointment, practice, uid, newAppointment } = useOs();
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const [mode, setMode] = useState<"view" | "cancel" | "resched">("view");
  const [reason, setReason] = useState(REASONS[0]);
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState("09:00");

  const ev = useQuery(
    async () => {
      if (!apptId || !practice) return null;
      const rows = await query<Ev>(uid, `select a.id, a.starts_at, a.ends_at, a.status::text, a.source, a.created_at, a.practitioner_id, p.display_name practitioner, a.service_id, s.name service, s.price_cents,
          c.id client_id, trim(c.first_name || ' ' || c.last_name) client, c.phone, c.email
        from public.appointments a join public.practitioners p on p.id = a.practitioner_id join public.services s on s.id = a.service_id join public.clients c on c.id = a.client_id where a.id = $1`, [apptId]);
      return rows[0] ?? null;
    },
    [apptId, practice?.id, uid],
    { enabled: !!apptId },
  );
  const hist = useQuery(() => (apptId ? query<{ at: Date; action: string; actor_name: string | null; meta: Record<string, string> }>(uid, "select * from public.appointment_history($1)", [apptId]) : Promise.resolve([])), [apptId, uid], { enabled: !!apptId });
  const e = ev.data;

  useEffect(() => {
    if (e) { setDate(dayKey(e.starts_at)); setTime(fmtTime(e.starts_at)); setMode("view"); }
  }, [e?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const slots = useQuery(
    async () => (e && mode === "resched" ? query<{ starts_at: Date }>(uid, "select starts_at from public.get_available_slots($1, $2, $3::date, $3::date)", [e.practitioner_id, e.service_id, date]) : []),
    [e?.id, mode, date, uid],
    { enabled: !!e && mode === "resched" },
  );
  const slotTimes = useMemo(() => (slots.data ?? []).map((s) => fmtTime(s.starts_at)), [slots.data]);

  if (!apptId) return null;

  async function act(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try { await fn(); toast(ok); setMode("view"); } catch (err) { toast(friendlyError(err)); } finally { setBusy(""); }
  }
  const setStatus = (s: string, ok: string) => act(s, () => mutate(uid, "select public.set_appointment_status($1, $2::public.appointment_status)", [apptId, s]), ok);

  const st = e ? APPT_STATUS[e.status] : null;
  const live = e && ["booked", "confirmed"].includes(e.status);
  const checkedIn = e?.status === "checked_in";
  const inProg = e?.status === "in_progress";

  return (
    <Drawer
      onClose={closeAppointment}
      title={e ? e.client : "Appointment"}
      sub={e ? <span>{e.service} · {relativeDay(e.starts_at)}, {fmtTime(e.starts_at)}–{fmtTime(e.ends_at)}</span> : undefined}
      footer={
        e && mode === "view" ? (
          <>
            {live && <Btn className="primary" loading={busy === "checked_in"} onClick={() => setStatus("checked_in", "Checked in")}><DoorOpen size={16} /> Check in</Btn>}
            {(live || checkedIn) && <Btn className="soft" loading={busy === "in_progress"} onClick={() => setStatus("in_progress", "Consultation started")}><Play size={16} /> Start</Btn>}
            {inProg && <Btn className="primary" loading={busy === "completed"} onClick={() => setStatus("completed", "Marked complete")}><CircleCheck size={16} /> Complete</Btn>}
            {(live || checkedIn) && <Btn className="secondary" onClick={() => setMode("resched")}><CalendarClock size={16} /> Reschedule</Btn>}
            {(live || checkedIn) && <Btn className="ghost" loading={busy === "no_show"} onClick={() => setStatus("no_show", "Marked as no-show")}><UserX size={16} /> No-show</Btn>}
            {(live || checkedIn) && <Btn className="danger" onClick={() => setMode("cancel")}><Ban size={16} /> Cancel</Btn>}
            {!live && !checkedIn && !inProg && <Btn className="secondary" onClick={() => { closeAppointment(); newAppointment({ clientId: e.client_id, practitionerId: e.practitioner_id }); }}><RotateCcw size={16} /> Book again</Btn>}
          </>
        ) : undefined
      }
    >
      {!e ? (
        <div className="a-skel" style={{ height: 240 }} />
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Badge tone={st!.tone} dot>{st!.label}</Badge>
            <span style={{ color: "var(--ink-3)", fontSize: 13 }}>{isBabyBlue(e.source) ? <BabyBlueTag source={e.source} /> : SOURCE_LABEL[e.source] ?? e.source} · booked {relativeDay(e.created_at)}</span>
          </div>
          {isBabyBlue(e.source) && <div className="os-bb-note"><b>Booked on BabyBlue.</b> {e.client.split(" ")[0]} chose this time themselves in the BabyBlue app, {relativeDay(e.created_at)} at {fmtTime(e.created_at)}.</div>}

          {mode === "cancel" && (
            <div className="a-card pad flat" style={{ display: "flex", flexDirection: "column", gap: 14, background: "var(--bad-bg)", border: 0 }}>
              <b style={{ color: "var(--bad)" }}>Cancel this appointment?</b>
              <Field label="Reason" htmlFor="rs"><select id="rs" className="a-select" value={reason} onChange={(x) => setReason(x.target.value)}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
              <div style={{ display: "flex", gap: 10 }}>
                <Btn className="danger-solid" loading={busy === "cancel"} onClick={() => act("cancel", () => mutate(uid, "select public.cancel_appointment($1, $2)", [apptId, reason]), "Appointment cancelled")}>Cancel appointment</Btn>
                <Btn className="ghost" onClick={() => setMode("view")}>Keep</Btn>
              </div>
            </div>
          )}

          {mode === "resched" && (
            <div className="a-card pad flat" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <b>Move to a new time</b>
              <div className="two-col" style={{ gap: 12 }}>
                <Field label="Date" htmlFor="d"><input id="d" type="date" className="a-input" min={todayKey()} value={date} onChange={(x) => setDate(x.target.value)} /></Field>
                <Field label="Time" htmlFor="t"><input id="t" type="time" step={300} className="a-input" value={time} onChange={(x) => setTime(x.target.value)} /></Field>
              </div>
              {slotTimes.length > 0 && (
                <div><p className="a-hint" style={{ marginBottom: 8 }}>Open times that day</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{slotTimes.map((t) => <button key={t} className="a-chip" aria-pressed={time === t} style={{ height: 34 }} onClick={() => setTime(t)}>{t}</button>)}</div>
                </div>
              )}
              <p className="a-hint">Staff can move an appointment outside published hours, but never on top of another booking.</p>
              <div style={{ display: "flex", gap: 10 }}>
                <Btn className="primary" loading={busy === "resched"} onClick={() => act("resched", () => mutate(uid, "select public.reschedule_appointment($1, $2::timestamptz)", [apptId, atTime(date, time).toISOString()]), "Appointment moved")}>Move appointment</Btn>
                <Btn className="ghost" onClick={() => setMode("view")}>Back</Btn>
              </div>
            </div>
          )}

          <section className="a-card pad flat" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <Avatar name={e.client} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}><b style={{ color: "var(--deep)" }}>{e.client}</b><br /><Link href={`/practice/clients/${e.client_id}`} className="a-link" style={{ fontSize: 13.5 }} onClick={closeAppointment}>Open client record</Link></div>
            </div>
            {e.phone && (() => {
              const ph = parsePhone(e.phone);
              return (
                <p style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 14 }}>
                  <Phone size={15} color="#5a7282" /> <a href={`tel:${e.phone.replace(/\s/g, "")}`}>{ph.ok ? formatPhone(ph.e164) : e.phone}</a>
                  {ph.ok && ph.mobile && <a className="a-badge good" href={whatsappLink(ph.e164)} target="_blank" rel="noopener noreferrer"><MessageCircle size={13} /> WhatsApp</a>}
                </p>
              );
            })()}
            {e.email && <p style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}><Mail size={15} color="#5a7282" /> <a href={`mailto:${e.email}`}>{e.email}</a></p>}
          </section>

          <dl className="a-kv">
            <dt>Date</dt><dd>{fmtLongDate(e.starts_at)}</dd>
            <dt>Time</dt><dd className="tnum">{fmtTime(e.starts_at)} – {fmtTime(e.ends_at)} ({Math.round((e.ends_at.getTime() - e.starts_at.getTime()) / 60000)} min)</dd>
            <dt>Practitioner</dt><dd>{e.practitioner}</dd>
            <dt>Service</dt><dd>{e.service}</dd>
            <dt>Fee</dt><dd className="tnum">{money(e.price_cents) || "—"}</dd>
          </dl>

          <section>
            <h3 style={{ fontSize: 14, marginBottom: 10, fontFamily: "var(--font-inter)", letterSpacing: 0 }}>Activity</h3>
            {(hist.data ?? []).length === 0 ? <p className="a-hint">No changes recorded yet.</p> : (
              <div className="pt-timeline">
                {(hist.data ?? []).map((h, i) => (
                  <div key={i} className="pt-tl done"><span className="d" /><div><b style={{ fontSize: 13.5, color: "var(--deep)" }}>{h.action.replace("appointment.", "").replace(/_/g, " ")}</b><p style={{ color: "var(--ink-3)", fontSize: 12.5 }}>{h.actor_name ?? "System"} · {relativeDay(h.at)} {fmtTime(h.at)}</p></div></div>
                ))}
              </div>
            )}
          </section>
          {e.status === "no_show" && <Notice tone="warn">Marked as a no-show. The time cannot be rebooked from here.</Notice>}
        </>
      )}
    </Drawer>
  );
}
