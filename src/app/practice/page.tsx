"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, CalendarCheck, CalendarDays, Check, CircleCheck, Clock, DoorOpen, Plus, Play, Percent, UserPlus, Wallet, Gauge } from "lucide-react";
import { Badge, Btn, Empty } from "@/components/app/primitives";
import { StackedBars, Sparkline, HBars } from "@/components/os/charts";
import { PRAC_COLORS, useOs } from "@/components/os/OsContext";
import { useToast } from "@/components/ui";
import { addDaysKey, dayStart, fmtLongDate, fmtTime, money, todayKey } from "@/lib/format";
import { APPT_STATUS, loadEvents, loadPractitioners } from "@/lib/os-data";
import { friendlyError, mutate, query } from "@/local/db";
import { useQuery } from "@/local/hooks";

interface Stats {
  today_total: number; today_completed: number; today_remaining: number; upcoming_7d: number; new_bookings_7d: number; bookings_30d: number; cancelled_30d: number; no_show_30d: number;
  scheduled_30d: number; new_clients_30d: number; total_clients: number; booked_minutes_7d: number; available_minutes_7d: number; utilisation_7d: number | null; revenue_est_30d_cents: number;
  queue_waiting: number; by_day: { day: string; booked: number; cancelled: number }[]; top_services: { name: string; n: number }[];
}

export default function Dashboard() {
  const os = useOs();
  const toast = useToast();
  const pid = os.practice?.id ?? "";
  const stats = useQuery(() => query<{ s: Stats }>(os.uid, "select public.practice_stats($1) s", [pid]).then((r) => r[0].s), [pid, os.uid], { enabled: !!pid, poll: 20000 });
  const today = todayKey();
  const agenda = useQuery(() => loadEvents(os.uid, pid, dayStart(today), dayStart(addDaysKey(today, 1))), [pid, today, os.uid], { enabled: !!pid, poll: 15000 });
  const pracs = useQuery(() => loadPractitioners(os.uid, pid), [pid, os.uid], { enabled: !!pid });
  const queue = useQuery(() => query<{ id: string; display_name: string; urgency: string; joined_at: Date; status: string }>(os.uid, "select id, display_name, urgency, joined_at, status::text from public.queue_entries where practice_id = $1 and status in ('waiting','in_consultation') order by status desc, seq limit 5", [pid]), [pid, os.uid], { enabled: !!pid, poll: 6000 });
  const setup = useQuery(async () => {
    const [r] = await query<{ pracs: number; listed: number; verified: number; svcs: number; rules: number }>(os.uid,
      `select (select count(*)::int from public.practitioners where practice_id = $1) pracs,
              (select count(*)::int from public.practitioners where practice_id = $1 and listing_status = 'listed') listed,
              (select count(*)::int from public.practitioners where practice_id = $1 and verification_status = 'verified') verified,
              (select count(*)::int from public.services where practice_id = $1 and active) svcs,
              (select count(*)::int from public.availability_rules where practice_id = $1) rules`, [pid]);
    return r;
  }, [pid, os.uid], { enabled: !!pid });

  const colorOf = useMemo(() => { const m = new Map<string, number>(); (pracs.data ?? []).forEach((p, i) => m.set(p.id, i)); return (id: string) => PRAC_COLORS[(m.get(id) ?? 0) % PRAC_COLORS.length]; }, [pracs.data]);
  const s = stats.data;
  const hour = Number(fmtTime(new Date()).slice(0, 2));
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = os.session.name.replace(/^(Dr|Prof)\.?\s+/i, "").split(" ")[0];
  const spark = (s?.by_day ?? []).slice(-14).map((d) => d.booked);
  const cancelRate = s && s.scheduled_30d > 0 ? Math.round((s.cancelled_30d / s.scheduled_30d) * 1000) / 10 : null;

  async function act(id: string, status: string, ok: string) {
    try { await mutate(os.uid, "select public.set_appointment_status($1, $2::public.appointment_status)", [id, status]); toast(ok); } catch (e) { toast(friendlyError(e)); }
  }

  const checklist = [
    { ok: (setup.data?.pracs ?? 0) > 0, t: "Add a practitioner", d: "At least one person patients can book.", href: "/practice/team" },
    { ok: (setup.data?.svcs ?? 0) > 0, t: "Add services", d: "What you offer, how long it takes and the fee.", href: "/practice/services" },
    { ok: (setup.data?.rules ?? 0) > 0, t: "Set weekly hours", d: "Patients can only book inside your hours.", href: "/practice/team" },
    { ok: (setup.data?.listed ?? 0) > 0 && os.practice?.status === "active", t: "Go live", d: "List a practitioner and get the practice activated.", href: "/practice/team" },
    { ok: (setup.data?.verified ?? 0) > 0, t: "Get verified", d: "Submit registration details for a verified badge.", href: "/practice/team" },
  ];
  const done = checklist.filter((c) => c.ok).length;

  return (
    <>
      <div className="os-page-h">
        <div><h1>{greet}, {first}</h1><p>{fmtLongDate(new Date())} · {os.practice?.name}</p></div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/practice/calendar" className="a-btn secondary"><CalendarDays size={17} /> Open calendar</Link>
          <Btn className="primary" onClick={() => os.newAppointment()}><Plus size={17} /> New appointment</Btn>
        </div>
      </div>

      <div className="os-kpis">
        <div className="a-card os-kpi"><span className="k"><span className="ic"><CalendarCheck size={16} /></span> Today</span><span className="v tnum">{s ? s.today_total : "–"}</span><span className="s">{s ? `${s.today_completed} done · ${s.today_remaining} to go` : " "}</span></div>
        <div className="a-card os-kpi"><span className="k"><span className="ic"><Clock size={16} /></span> Next 7 days</span><span className="v tnum">{s ? s.upcoming_7d : "–"}</span><span className="s">{s ? `${s.new_bookings_7d} new bookings this week` : " "}</span><span className="spark"><Sparkline values={spark} /></span></div>
        <div className="a-card os-kpi"><span className="k"><span className="ic"><Gauge size={16} /></span> Utilisation (7 days)</span><span className="v tnum">{s ? (s.utilisation_7d != null ? `${Math.round(s.utilisation_7d)}%` : "n/a") : "–"}</span><span className="s">{s?.available_minutes_7d ? `${Math.round(s.booked_minutes_7d / 60)}h booked of ${Math.round(s.available_minutes_7d / 60)}h open` : "No opening hours set"}</span></div>
        <div className="a-card os-kpi"><span className="k"><span className="ic"><UserPlus size={16} /></span> New clients (30 days)</span><span className="v tnum">{s ? s.new_clients_30d : "–"}</span><span className="s">{s ? `${s.total_clients} clients in total` : " "}</span></div>
        <div className="a-card os-kpi"><span className="k"><span className="ic"><Percent size={16} /></span> Cancellations (30 days)</span><span className="v tnum">{cancelRate != null ? `${cancelRate}%` : "n/a"}</span><span className="s">{s ? `${s.cancelled_30d} cancelled · ${s.no_show_30d} no-shows` : " "}</span></div>
        <div className="a-card os-kpi"><span className="k"><span className="ic"><Wallet size={16} /></span> Est. revenue (30 days)</span><span className="v tnum">{s ? money(s.revenue_est_30d_cents) : "–"}</span><span className="s">From completed visits at listed fees</span></div>
      </div>

      <div className="os-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="a-card">
            <div className="os-card-h"><h2>Today&apos;s agenda</h2><Link href="/practice/calendar" className="a-link" style={{ fontSize: 14 }}>Full calendar <ArrowRight size={14} style={{ verticalAlign: "-2px" }} /></Link></div>
            <div style={{ marginTop: 10 }}>
              {agenda.loading && !agenda.data && <div style={{ padding: 20 }}><div className="a-skel" style={{ height: 180 }} /></div>}
              {(agenda.data ?? []).map((e) => {
                const col = colorOf(e.practitioner_id);
                const st = APPT_STATUS[e.status];
                const live = ["booked", "confirmed"].includes(e.status);
                return (
                  <div key={e.id} className="os-row" onClick={() => os.openAppointment(e.id)} role="button" tabIndex={0} onKeyDown={(k) => k.key === "Enter" && os.openAppointment(e.id)}>
                    <span className="t tnum">{fmtTime(e.starts_at)}<small>{fmtTime(e.ends_at)}</small></span>
                    <span style={{ minWidth: 0 }}>
                      <b style={{ color: "var(--deep)", display: "block" }}>{e.client}</b>
                      <span style={{ color: "var(--ink-2)", fontSize: 13.5, display: "flex", gap: 7, alignItems: "center" }}><i className="os-prac-dot" style={{ background: col.solid }} /> {e.service} · {e.practitioner}</span>
                    </span>
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }} onClick={(x) => x.stopPropagation()}>
                      <Badge tone={st.tone} dot>{st.label}</Badge>
                      {live && <button className="a-btn soft sm" onClick={() => act(e.id, "checked_in", "Checked in")}><DoorOpen size={14} /> Check in</button>}
                      {e.status === "checked_in" && <button className="a-btn soft sm" onClick={() => act(e.id, "in_progress", "Consultation started")}><Play size={14} /> Start</button>}
                      {e.status === "in_progress" && <button className="a-btn primary sm" onClick={() => act(e.id, "completed", "Marked complete")}><CircleCheck size={14} /> Complete</button>}
                    </span>
                  </div>
                );
              })}
              {agenda.data?.length === 0 && <Empty icon={<CalendarCheck size={26} />} title="Nothing booked today" action={<Btn className="primary" onClick={() => os.newAppointment()}>Book an appointment</Btn>}>Your agenda is clear. New bookings will appear here as they come in.</Empty>}
            </div>
          </section>

          <section className="a-card">
            <div className="os-card-h"><div><h2>Bookings, last 30 days</h2><p className="a-hint" style={{ marginTop: 2 }}>Every number is counted from your real appointments.</p></div>
              <div className="ch-legend"><span><i style={{ background: "#3097b2" }} />Booked</span><span><i style={{ background: "#e8a29d" }} />Cancelled</span></div></div>
            <div className="os-card-b">
              <StackedBars height={180} colors={["#3097b2", "#e8a29d"]} names={["Booked", "Cancelled"]} labelEvery={5}
                data={(s?.by_day ?? []).map((d) => ({ label: d.day.slice(8) + "/" + d.day.slice(5, 7), sub: d.day, values: [d.booked, d.cancelled] }))} />
            </div>
          </section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="a-card">
            <div className="os-card-h"><h2>Queue right now</h2><Link href="/practice/queue" className="a-link" style={{ fontSize: 14 }}>Open</Link></div>
            <div style={{ padding: "12px 20px 18px" }}>
              <div style={{ display: "flex", gap: 22, marginBottom: 10 }}>
                <div><b className="tnum" style={{ fontFamily: "var(--font-head)", fontSize: 30, color: "var(--deep)" }}>{s?.queue_waiting ?? "–"}</b><p className="a-hint">waiting</p></div>
                <div><b className="tnum" style={{ fontFamily: "var(--font-head)", fontSize: 30, color: "var(--deep)" }}>{(queue.data ?? []).filter((q) => q.status === "in_consultation").length}</b><p className="a-hint">with a practitioner</p></div>
              </div>
              {(queue.data ?? []).filter((q) => q.status === "waiting").slice(0, 3).map((q) => (
                <div key={q.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--line-2)", fontSize: 14 }}>
                  <span style={{ fontWeight: 600, color: "var(--deep)" }}>{q.display_name}</span><span style={{ color: "var(--ink-3)" }}>{q.urgency !== "routine" ? <Badge tone={q.urgency === "urgent" ? "bad" : "warn"}>{q.urgency}</Badge> : "Waiting"}</span>
                </div>
              ))}
              {queue.data?.length === 0 && <p className="a-hint">Nobody is waiting.</p>}
            </div>
          </section>

          <section className="a-card">
            <div className="os-card-h"><h2>Practice setup</h2><span className="a-badge info">{done} of {checklist.length}</span></div>
            <div style={{ padding: "12px 20px 16px" }}>
              <div className="a-meter" style={{ marginBottom: 12 }}><i style={{ width: `${(done / checklist.length) * 100}%` }} /></div>
              {checklist.map((c) => (
                <Link key={c.t} href={c.href} className="os-check" style={{ textDecoration: "none", color: "inherit" }}>
                  {c.ok ? <span className="ok"><Check size={14} strokeWidth={3} /></span> : <span className="todo" />}
                  <span><b style={{ color: "var(--deep)", fontSize: 14, textDecoration: c.ok ? "line-through" : "none", opacity: c.ok ? 0.6 : 1 }}>{c.t}</b><br /><span style={{ color: "var(--ink-3)", fontSize: 12.5 }}>{c.d}</span></span>
                </Link>
              ))}
            </div>
          </section>

          <section className="a-card">
            <div className="os-card-h"><h2>Top services</h2><span className="a-hint">last 30 days</span></div>
            <div className="os-card-b"><HBars items={(s?.top_services ?? []).map((t) => ({ label: t.name, value: t.n }))} /></div>
          </section>
        </div>
      </div>
    </>
  );
}
