"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarCheck, CalendarPlus, ChevronRight, History } from "lucide-react";
import { Badge, Empty, Skel } from "@/components/app/primitives";
import { RequireAuth } from "@/components/patient/RequireAuth";
import { fmtDayMonth, fmtMonthShort, fmtTime, fmtWeekday, money, relativeDay, untilText } from "@/lib/format";
import { STATUS_UI, type MyAppt } from "@/lib/appt";
import { query } from "@/local/db";
import { useSession } from "@/local/auth";
import { useQuery } from "@/local/hooks";

export default function AppointmentsPage() {
  return (
    <RequireAuth>
      <List />
    </RequireAuth>
  );
}

function List() {
  const { session } = useSession("patient");
  const uid = session!.userId;
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const appts = useQuery(() => query<MyAppt>(uid, "select * from public.my_appointments()"), [uid], { poll: 15000 });
  const now = Date.now();
  const live = (a: MyAppt) => ["booked", "confirmed", "checked_in", "in_progress"].includes(a.status) && a.ends_at.getTime() > now;
  const upcoming = (appts.data ?? []).filter(live).sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime());
  const past = (appts.data ?? []).filter((a) => !live(a));
  const list = tab === "upcoming" ? upcoming : past;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 30 }}>Appointments</h1>
          <p style={{ color: "var(--ink-2)", marginTop: 2 }}>Everything you&apos;ve booked, in one place.</p>
        </div>
        <Link href="/patient/search" className="a-btn primary"><CalendarPlus size={18} /> Book new</Link>
      </div>
      <div className="a-seg" role="tablist" style={{ marginBottom: 18 }}>
        <button role="tab" aria-selected={tab === "upcoming"} onClick={() => setTab("upcoming")}>Upcoming{upcoming.length ? ` · ${upcoming.length}` : ""}</button>
        <button role="tab" aria-selected={tab === "past"} onClick={() => setTab("past")}>Past{past.length ? ` · ${past.length}` : ""}</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {appts.loading && !appts.data && [0, 1, 2].map((i) => <div key={i} className="a-card pt-appt"><Skel w={74} h={74} r={18} /><div style={{ display: "flex", flexDirection: "column", gap: 8 }}><Skel h={18} w="60%" /><Skel h={14} w="40%" /></div></div>)}
        {list.map((a) => {
          const ui = STATUS_UI[a.status] ?? STATUS_UI.booked;
          const isPast = tab === "past";
          return (
            <Link key={a.id} href={`/patient/appointments/${a.id}`} className="a-card hover pt-appt" style={{ opacity: a.status === "cancelled" ? 0.75 : 1 }}>
              <div className={`pt-datebox ${isPast ? "past" : ""}`}>
                <small>{fmtWeekday(a.starts_at)}</small>
                <b>{fmtDayMonth(a.starts_at).split(" ")[0]}</b>
                <span>{fmtMonthShort(a.starts_at)}</span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
                  <Badge tone={ui.tone} dot>{ui.label}</Badge>
                  {!isPast && <span style={{ fontSize: 12.5, color: "var(--info)", fontWeight: 700 }}>{untilText(a.starts_at)}</span>}
                </div>
                <h3 style={{ fontSize: 18 }}>{a.service_name}</h3>
                <p style={{ color: "var(--ink-2)", fontSize: 14.5 }}>{a.practitioner_name} · {a.practice_name}</p>
                <p className="tnum" style={{ color: "var(--ink-3)", fontSize: 13.5, marginTop: 2 }}>{relativeDay(a.starts_at)}, {fmtTime(a.starts_at)} – {fmtTime(a.ends_at)} · {money(a.price_cents)}</p>
              </div>
              <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--link)", fontWeight: 600, fontSize: 14 }}>View <ChevronRight size={18} /></span>
            </Link>
          );
        })}
        {!appts.loading && list.length === 0 && (
          <div className="a-card">
            {tab === "upcoming" ? (
              <Empty icon={<CalendarCheck size={28} />} title="Nothing booked yet" action={<Link href="/patient/search" className="a-btn primary">Find a practitioner</Link>}>When you book, your appointments will appear here with reminders and easy changes.</Empty>
            ) : (
              <Empty icon={<History size={28} />} title="No past appointments">Completed and cancelled appointments will show up here.</Empty>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
