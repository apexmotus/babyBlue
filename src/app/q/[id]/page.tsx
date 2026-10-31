"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, CalendarPlus, Check, ClipboardList, Clock, MessageSquareText, Phone, RefreshCw, Star, WifiOff, DoorOpen } from "lucide-react";
import { Banner, Logo, Modal, StatusPill, useToast } from "@/components/ui";
import { useOffline } from "@/lib/offline";
import { cancelVisit, estimateFor, fullName, joinQueue, patientOf, positionOf, submitFeedback, useDB, visitById } from "@/lib/store";
import type { DB, Visit } from "@/lib/types";

export default function Status() {
  const { id } = useParams<{ id: string }>();
  const db = useDB();
  const visit = visitById(db, id);
  const { offline } = useOffline();
  const [stamp, setStamp] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  // "Updated just now" label — resets every time the shared record changes.
  useEffect(() => {
    setStamp(Date.now());
  }, [db.updatedAt]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const ago = stamp && now ? Math.floor((now - stamp) / 60000) : 0;
  const updated = ago < 1 ? "Updated just now" : `Updated ${ago} min ago`;

  if (!visit) {
    return (
      <Shell title="Visit not found">
        <div className="card r16" style={{ padding: 24, textAlign: "center" }}>
          <p className="b6 t16">We can&apos;t find this visit</p>
          <p className="muted" style={{ marginTop: 6 }}>The link may be old, or demo data was reset.</p>
          <Link href={`/c/${db.settings.slug}`} className="btn btn-primary" style={{ marginTop: 16 }}>Go to the clinic page</Link>
        </div>
      </Shell>
    );
  }
  const patient = patientOf(db, visit.patientId);
  return (
    <Shell title={db.settings.name}>
      {visit.status === "waiting" && <Waiting db={db} visit={visit} offline={offline} updated={updated} phone={patient?.phone ?? ""} />}
      {visit.status === "in_consultation" && <InConsult db={db} visit={visit} updated={updated} />}
      {visit.status === "done" && <Done db={db} visit={visit} />}
      {visit.status === "cancelled" && <Cancelled db={db} visit={visit} />}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="m-wrap">
      <div className="m-app">
        <div className="m-head">
          <div>
            <p className="muted t12">Your visit at</p>
            <h1 style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{title}</h1>
          </div>
          <Logo size={26} />
        </div>
        <div className="m-body">{children}</div>
      </div>
    </div>
  );
}

function Waiting({ db, visit, offline, updated, phone }: { db: DB; visit: Visit; offline: boolean; updated: string; phone: string }) {
  const pos = positionOf(db, visit.id);
  const [leave, setLeave] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const intakeDone = !!visit.intake;
  const patient = patientOf(db, visit.patientId);
  const [retrying, setRetrying] = useState(false);
  const { setOffline } = useOffline();
  return (
    <>
      {offline && (
        <Banner tone="warn" icon={<WifiOff size={16} />}>
          <strong>Offline — reconnecting…</strong>
        </Banner>
      )}
      <div className="card r16" style={{ padding: 24, textAlign: "center" }}>
        <StatusPill status="waiting" className="" />
        <p className="big-num" style={{ marginTop: 22 }}>#{pos}</p>
        <p className="muted" style={{ marginTop: 8 }}>{pos === 1 ? "You're next in line" : "in line"}</p>
        {db.settings.showEstimates && (
          <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <div className="flex center gap8" style={{ justifyContent: "center" }}>
              <Clock size={15} color="#64748b" />
              <span className="muted t13">Estimated wait</span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>{estimateFor(db, pos)}</p>
            <p className="muted t12" style={{ marginTop: 6 }}>
              {offline ? "Last confirmed 3 minutes ago" : "Based on today's pace at this practice"}
            </p>
          </div>
        )}
      </div>

      {offline ? (
        <>
          <Banner tone="neutral">
            We can&apos;t reach the practice from your phone right now. Your place is held — this screen will catch up on its own. If you&apos;re nearby, stay in the building.
          </Banner>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setRetrying(true);
              setTimeout(() => {
                setRetrying(false);
                setOffline(false);
              }, 900);
            }}
          >
            <RefreshCw size={16} className={retrying ? "spin" : ""} /> {retrying ? "Trying…" : "Try again now"}
          </button>
        </>
      ) : (
        <>
          <Link href={`/q/${visit.id}/intake`} className="row-card" style={{ color: "inherit" }}>
            <span className="ic" style={{ background: intakeDone ? "var(--accent-50)" : "var(--primary-50)" }}>
              {intakeDone ? <Check size={18} color="#2b7557" /> : <ClipboardList size={18} color="#1d6f86" />}
            </span>
            <div className="grow">
              <p className="t">{intakeDone ? "Quick intake submitted" : "Complete quick intake"}</p>
              <p className="s">{intakeDone ? "The doctor will see your answers before you go in" : "Four questions, helps the doctor prepare"}</p>
            </div>
            <span className="t13" style={{ fontWeight: 500, color: "var(--primary)" }}>{intakeDone ? "Edit" : "Start"}</span>
          </Link>
          <Link href={`/q/${visit.id}/messages`} className="row-card" style={{ color: "inherit" }}>
            <span className="ic" style={{ background: "var(--accent-50)" }}><Bell size={18} color="#2b7557" /></span>
            <div className="grow">
              <p className="t">We&apos;ll message you when you&apos;re two away</p>
              <p className="s">{patient?.whatsapp ? "WhatsApp" : "SMS"} to {phone}{patient?.whatsapp ? ", SMS if it fails" : ""}</p>
            </div>
            <MessageSquareText size={16} color="#94a3b8" />
          </Link>
          <div className="flex center gap8" style={{ justifyContent: "center" }}>
            <span className="live-dot" />
            <span className="muted t12">{updated}</span>
          </div>
        </>
      )}
      <div style={{ marginTop: "auto", paddingTop: 8, textAlign: "center" }}>
        <button className="btn-link" onClick={() => setLeave(true)}>Leave the queue</button>
      </div>

      {leave && (
        <Modal
          title="Leave the queue?"
          onClose={() => setLeave(false)}
          small
          footer={
            <div className="flex col gap8" style={{ width: "100%" }}>
              <button className="btn btn-primary block" onClick={() => setLeave(false)}>Keep my place</button>
              <button
                className="btn btn-danger-soft block"
                onClick={() => {
                  cancelVisit(visit.id, "patient");
                  setLeave(false);
                  toast("You've left the queue");
                  router.refresh();
                }}
              >
                Yes, leave the queue
              </button>
            </div>
          }
        >
          <p className="muted" style={{ lineHeight: 1.55 }}>
            You&apos;ll lose position <strong style={{ color: "var(--ink)" }}>#{pos}</strong>. This can&apos;t be undone — to be seen today you&apos;d have to join again from the start, behind everyone currently waiting.
          </p>
        </Modal>
      )}
    </>
  );
}

function InConsult({ db, visit, updated }: { db: DB; visit: Visit; updated: string }) {
  const doc = visit.doctor ?? "The doctor";
  return (
    <>
      <div className="card r16" style={{ padding: 24, textAlign: "center" }}>
        <StatusPill status="in_consultation" />
        <div style={{ width: 64, height: 64, borderRadius: 999, background: "var(--primary-50)", margin: "20px auto 0", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <DoorOpen size={30} color="#1d6f86" />
        </div>
        <p style={{ fontSize: 22, fontWeight: 700, marginTop: 16, letterSpacing: -0.4 }}>You&apos;re being seen now</p>
        <p className="muted" style={{ marginTop: 8 }}>
          {doc} has called you. Please go through to {visit.room ?? "the consulting room"}.
        </p>
      </div>
      <div className="card r16" style={{ padding: 18 }}>
        <p className="b6" style={{ marginBottom: 12 }}>Your visit</p>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "1fr auto", rowGap: 10, columnGap: 12 }} className="t13">
          <dt className="muted">Joined</dt><dd style={{ margin: 0, fontWeight: 500 }}>{visit.joinedAt}</dd>
          <dt className="muted">Called</dt><dd style={{ margin: 0, fontWeight: 500 }}>{visit.calledAt}</dd>
          <dt className="muted">Intake</dt><dd style={{ margin: 0, fontWeight: 500 }}>{visit.intake ? "Submitted" : "Not completed"}</dd>
        </dl>
      </div>
      <div className="flex center gap8" style={{ justifyContent: "center" }}>
        <span className="live-dot" />
        <span className="muted t12">{updated}</span>
      </div>
    </>
  );
}

function Done({ db, visit }: { db: DB; visit: Visit }) {
  const [rating, setRating] = useState(visit.feedback?.rating ?? 0);
  const [comment, setComment] = useState(visit.feedback?.comment ?? "");
  const [sent, setSent] = useState(!!visit.feedback);
  const toast = useToast();
  const mins = visit.calledAt && visit.doneAt ? toMin(visit.doneAt) - toMin(visit.calledAt) : null;
  return (
    <>
      <div className="card r16" style={{ padding: 24, textAlign: "center" }}>
        <StatusPill status="done" />
        <div style={{ width: 56, height: 56, borderRadius: 999, background: "var(--accent-50)", margin: "18px auto 0", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Check size={28} color="#2b7557" />
        </div>
        <p style={{ fontSize: 22, fontWeight: 700, marginTop: 14, letterSpacing: -0.4 }}>Visit complete</p>
        <p className="muted" style={{ marginTop: 6 }}>
          Seen at {visit.calledAt}
          {mins && mins > 0 ? ` · ${mins} minutes in the room` : ""}
        </p>
      </div>
      <div className="card r16" style={{ padding: 20 }}>
        {sent ? (
          <div style={{ textAlign: "center" }}>
            <p className="b6">Thank you — feedback sent</p>
            <div className="flex gap8" style={{ justifyContent: "center", marginTop: 10 }}>
              {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={22} fill={n <= rating ? "#f59e0b" : "none"} color={n <= rating ? "#f59e0b" : "#cbd5e1"} />)}
            </div>
          </div>
        ) : (
          <>
            <p className="b6">How was your visit today?</p>
            <div className="flex gap8" style={{ justifyContent: "center", margin: "14px 0" }} role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} style={{ border: 0, background: "none", padding: 4, minWidth: 44, minHeight: 44 }}>
                  <Star size={30} fill={n <= rating ? "#f59e0b" : "none"} color={n <= rating ? "#f59e0b" : "#cbd5e1"} />
                </button>
              ))}
            </div>
            <div className="field">
              <label>Anything you&apos;d like the practice to know? (optional)</label>
              <textarea className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} />
            </div>
            <button
              className="btn btn-primary block"
              style={{ marginTop: 14 }}
              disabled={!rating}
              onClick={() => {
                submitFeedback(visit.id, rating, comment.trim());
                setSent(true);
                toast("Feedback sent to reception");
              }}
            >
              Send feedback
            </button>
            <p className="hint" style={{ marginTop: 10, textAlign: "center" }}>Shared with reception as a rating and comment. Not part of your clinical record.</p>
          </>
        )}
      </div>
      <button className="row-card" style={{ textAlign: "left", width: "100%" }} onClick={() => toast("Demo: follow-up booking isn't wired up")}>
        <span className="ic" style={{ background: "var(--primary-50)" }}><CalendarPlus size={18} color="#1d6f86" /></span>
        <div className="grow">
          <p className="t">Book a follow-up</p>
          <p className="s">{db.settings.doctors[0]?.replace("Dr N.", "Dr")} suggested two weeks</p>
        </div>
        <span className="t13" style={{ fontWeight: 500, color: "var(--primary)" }}>Open</span>
      </button>
    </>
  );
}

function Cancelled({ db, visit }: { db: DB; visit: Visit }) {
  const router = useRouter();
  const patient = patientOf(db, visit.patientId);
  const byPatient = visit.cancelledBy === "patient";
  return (
    <>
      <div className="card r16" style={{ padding: 24, textAlign: "center" }}>
        <StatusPill status="cancelled" />
        <p style={{ fontSize: 22, fontWeight: 700, marginTop: 20, letterSpacing: -0.4 }}>{byPatient ? "You left the queue" : "This visit was cancelled"}</p>
        <p className="muted" style={{ marginTop: 8 }}>
          {byPatient ? `You left the queue at ${visit.cancelledAt}.` : `Cancelled by reception at ${visit.cancelledAt}.`} You are no longer in the queue.
        </p>
      </div>
      <div className="card r16" style={{ padding: 18 }}>
        <p className="b6">What you can do now</p>
        <p className="muted t13" style={{ marginTop: 6 }}>Joining again puts you at the back of the queue. Reception can explain what happened.</p>
      </div>
      <button
        className="btn btn-primary lg"
        onClick={() => {
          if (!patient) return;
          const id = joinQueue({ first: patient.first, last: patient.last, phone: patient.phone, whatsapp: patient.whatsapp, idType: patient.idType, idNumber: patient.idNumber, source: "qr" });
          router.push(`/q/${id}`);
        }}
      >
        Join the queue again
      </button>
      <a className="btn btn-secondary" href={`tel:${db.settings.phone.replace(/\s/g, "")}`}>
        <Phone size={16} /> Call reception · {db.settings.phone}
      </a>
    </>
  );
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
