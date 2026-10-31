"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Clock, UserPlus } from "lucide-react";
import { Empty, Modal, StatusPill, UrgencyPill, useToast } from "@/components/ui";
import { BookingModal, WalkInModal } from "@/components/staff-modals";
import { callVisit, cancelVisit, estimateFor, fullName, markSeen, patientOf, positionOf, todays, useDB } from "@/lib/store";
import type { Status, Visit } from "@/lib/types";
import { TODAY, longDate, fmtPhone, toMins } from "@/lib/util";

type Tab = "all" | Status;

export default function QueuePage() {
  const db = useDB();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("all");
  const [walkIn, setWalkIn] = useState(false);
  const [booking, setBooking] = useState(false);
  const [cancel, setCancel] = useState<Visit | null>(null);
  const [now, setNow] = useState(0);
  const [stamp, setStamp] = useState(0);

  useEffect(() => setStamp(Date.now()), [db.updatedAt]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const ago = stamp && now ? Math.floor((now - stamp) / 60000) : 0;

  const all = todays(db);
  const counts = {
    waiting: all.filter((v) => v.status === "waiting").length,
    in_consultation: all.filter((v) => v.status === "in_consultation").length,
    done: all.filter((v) => v.status === "done").length,
    cancelled: all.filter((v) => v.status === "cancelled").length,
  };
  const live = all.length - counts.cancelled;

  const rows = useMemo(() => {
    const order: Record<Status, number> = { in_consultation: 0, waiting: 1, done: 2, cancelled: 3 };
    return all
      .filter((v) => (tab === "all" ? v.status !== "cancelled" : v.status === tab))
      .sort((a, b) => order[a.status] - order[b.status] || (a.status === "done" ? toMins(b.joinedAt) - toMins(a.joinedAt) : a.seq - b.seq));
  }, [all, tab]);
  const firstWaiting = all.filter((v) => v.status === "waiting").sort((a, b) => a.seq - b.seq)[0];

  const tabs: [Tab, string, number][] = [
    ["all", "All", live],
    ["waiting", "Waiting", counts.waiting],
    ["in_consultation", "In consultation", counts.in_consultation],
    ["done", "Done", counts.done],
  ];
  if (counts.cancelled) tabs.push(["cancelled", "Cancelled", counts.cancelled]);

  return (
    <>
      <div className="page-h">
        <div>
          <h1>Today&apos;s queue</h1>
          <p>
            {longDate(TODAY)} · {db.settings.doctors.filter((d) => d.startsWith("Dr")).join(", ")} on shift
          </p>
        </div>
        <div className="flex gap8 wrap">
          <button className="btn btn-secondary" onClick={() => setBooking(true)}><CalendarPlus size={16} /> New booking</button>
          <button className="btn btn-primary" onClick={() => setWalkIn(true)}><UserPlus size={16} /> Add walk-in</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16, marginBottom: 24 }}>
        <div className="card stat"><div className="k">Waiting</div><div className="n">{counts.waiting}</div></div>
        <div className="card stat"><div className="k">Called today</div><div className="n">{counts.in_consultation + counts.done}</div></div>
        <div className="card stat"><div className="k">Seen today</div><div className="n">{counts.done}</div></div>
        <div className="card stat">
          <div className="k"><Clock size={14} /> Estimated median wait</div>
          <div className="n">{db.settings.medianWait} min</div>
        </div>
      </div>

      <div className="flex between center wrap gap12" style={{ marginBottom: 14 }}>
        <div className="seg" role="tablist">
          {tabs.map(([k, l, n]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              {l}<span>{n}</span>
            </button>
          ))}
        </div>
        <div className="flex center gap8">
          <span className="live-dot" />
          <span className="muted t12">Live · {ago < 1 ? "updated just now" : `updated ${ago} min ago`}</span>
        </div>
      </div>

      <div className="card table-scroll" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div className="qgrid qhead">
            <span>#</span><span>Patient</span><span>Reason</span><span>Joined</span><span>Estimated wait</span><span className="right">Actions</span>
          </div>
          {rows.length === 0 && <Empty title="Nobody here">Nothing matches this filter.</Empty>}
          {rows.map((v) => {
            const p = patientOf(db, v.patientId);
            const pos = positionOf(db, v.id);
            const consult = v.status === "in_consultation";
            return (
              <div key={v.id} className="qgrid" style={{ background: consult ? "#f8fbff" : undefined, opacity: v.status === "cancelled" ? 0.65 : 1 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--primary)" }}>{pos ? `#${pos}` : "—"}</span>
                <div>
                  <p className="b6" style={{ fontSize: 14 }}>{fullName(p)}</p>
                  <p className="muted t12" style={{ marginTop: 2 }}>
                    {p ? fmtPhone(p.phone) : ""}
                    {v.bookedFor ? ` · booked ${v.bookedFor}` : ""}
                  </p>
                </div>
                <div className="flex center gap8">
                  <UrgencyPill urgency={v.urgency} />
                  <span className="muted t13">{v.reason}</span>
                </div>
                <span className="muted t13">{v.joinedAt}</span>
                <div>
                  {v.status === "waiting" && db.settings.showEstimates ? (
                    <>
                      <p className="b6 t13">{estimateFor(db, pos)}</p>
                      <p className="muted" style={{ fontSize: 11, marginTop: 1 }}>Estimated</p>
                    </>
                  ) : v.status === "waiting" ? <span className="muted t13">Hidden</span> : (
                    <StatusPill status={v.status} />
                  )}
                </div>
                <div className="flex gap8" style={{ justifyContent: "flex-end" }}>
                  {v.status === "waiting" && (
                    <>
                      <button
                        className="tbtn primary"
                        onClick={() => {
                          callVisit(v.id);
                          toast(`${fullName(p)} called — their phone now shows “You're being seen”`);
                        }}
                      >
                        {firstWaiting?.id === v.id ? "Call next" : "Call"}
                      </button>
                      <button className="tbtn" onClick={() => setCancel(v)}>Cancel</button>
                    </>
                  )}
                  {consult && (
                    <button
                      className="tbtn good"
                      onClick={() => {
                        markSeen(v.id);
                        toast(`${fullName(p)} marked as seen`);
                      }}
                    >
                      Mark seen
                    </button>
                  )}
                  <Link className="tbtn" href={`/staff/visit/${v.id}`}>Open</Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {walkIn && <WalkInModal onClose={() => setWalkIn(false)} />}
      {booking && <BookingModal onClose={() => setBooking(false)} />}
      {cancel && (
        <Modal
          title="Cancel this visit?"
          onClose={() => setCancel(null)}
          small
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setCancel(null)}>Keep in queue</button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  cancelVisit(cancel.id, "reception");
                  toast(`${fullName(patientOf(db, cancel.patientId))} removed from the queue`);
                  setCancel(null);
                }}
              >
                Cancel visit
              </button>
            </>
          }
        >
          <p className="muted" style={{ lineHeight: 1.55 }}>
            {fullName(patientOf(db, cancel.patientId))} will be removed from the queue and their phone will say the visit was cancelled by reception. This can&apos;t be undone.
          </p>
        </Modal>
      )}
    </>
  );
}
