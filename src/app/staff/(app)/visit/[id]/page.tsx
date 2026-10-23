"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock, ShieldCheck } from "lucide-react";
import { Modal, StatusPill, useToast } from "@/components/ui";
import { callVisit, cancelVisit, estimateFor, fullName, markSeen, patientOf, positionOf, saveNote, setConsent, useDB, visitById } from "@/lib/store";
import { fmtPhone, initials, shortDate } from "@/lib/util";

export default function VisitDetail() {
  const { id } = useParams<{ id: string }>();
  const db = useDB();
  const toast = useToast();
  const visit = visitById(db, id);
  const [note, setNote] = useState("");
  const [loaded, setLoaded] = useState("");
  const [cancel, setCancel] = useState(false);
  const [withdraw, setWithdraw] = useState(false);

  const saved = visit?.note ?? "";
  useEffect(() => {
    if (visit && loaded !== visit.id) {
      setNote(saved);
      setLoaded(visit.id);
    }
  }, [visit, loaded, saved]);

  if (!visit) {
    return (
      <>
        <Link href="/staff" className="btn btn-ghost sm"><ArrowLeft size={14} /> Today&apos;s queue</Link>
        <div className="card" style={{ padding: 32, marginTop: 16, textAlign: "center" }}><p className="b6">That visit isn&apos;t in today&apos;s queue.</p></div>
      </>
    );
  }
  const p = patientOf(db, visit.patientId);
  const pos = positionOf(db, visit.id);
  const name = fullName(p);
  const questions = db.questions.filter((q) => q.active && visit.intake?.answers[q.id] !== undefined);
  const dirty = note !== saved;
  const timeline: [string, string, boolean][] = [
    [`Joined the queue ${visit.source === "walk-in" ? "at reception" : "from a phone"}`, `${visit.joinedAt} · ${visit.source === "walk-in" ? "added by reception" : "QR at reception"}`, true],
    ...(visit.intake ? ([["Intake submitted", visit.intake.at, true]] as [string, string, boolean][]) : []),
    ...(visit.status === "waiting" && pos <= 2 ? ([["“Two away” message delivered", `${visit.joinedAt} · ${p?.whatsapp ? "WhatsApp" : "SMS"}`, true]] as [string, string, boolean][]) : []),
    visit.calledAt ? [`Called${visit.doctor ? ` by ${visit.doctor}` : ""}`, `${visit.calledAt}${visit.room ? ` · ${visit.room}` : ""}`, true] : ["Called", "Pending", false],
    ...(visit.doneAt ? ([["Seen", visit.doneAt, true]] as [string, string, boolean][]) : []),
    ...(visit.cancelledAt ? ([[`Cancelled by ${visit.cancelledBy}`, visit.cancelledAt, true]] as [string, string, boolean][]) : []),
  ];

  return (
    <>
      <Link href="/staff" className="btn btn-ghost sm" style={{ marginBottom: 20 }}><ArrowLeft size={14} /> Today&apos;s queue</Link>
      <div className="page-h">
        <div className="flex center gap16">
          <span className="avatar lg">{initials(p?.first ?? "", p?.last ?? "")}</span>
          <div>
            <h1 style={{ fontSize: 24 }}>{name}</h1>
            <p style={{ marginTop: 2 }}>
              {p ? fmtPhone(p.phone) : ""}
              {p?.age ? ` · ${p.age} years` : ""} · joined the queue at {visit.joinedAt}
            </p>
          </div>
        </div>
        <div className="flex center gap12 wrap">
          <span style={{ fontWeight: 600 }} className="flex center gap8">
            <StatusPill status={visit.status} />
            {visit.status === "waiting" && <span className="b6">#{pos}</span>}
          </span>
          {visit.status === "waiting" && (
            <>
              <button className="btn btn-primary" onClick={() => { callVisit(visit.id); toast(`${name} called`); }}>{pos === 1 ? "Call next" : "Call"}</button>
              <button className="btn btn-ghost" onClick={() => setCancel(true)}>Cancel visit</button>
            </>
          )}
          {visit.status === "in_consultation" && (
            <button className="btn btn-accent" onClick={() => { markSeen(visit.id); toast(`${name} marked as seen`); }}>Mark seen</button>
          )}
          {p && <Link className="btn btn-secondary" href={`/staff/patients/${p.id}`}>Patient file</Link>}
        </div>
      </div>

      <div className="detail-grid">
        <div className="flex col gap16">
          <section className="card" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 16 }}>Intake answers</h2>
            {questions.length ? (
              <dl style={{ margin: "14px 0 0", display: "flex", flexDirection: "column", gap: 14 }}>
                {questions.map((q) => (
                  <div key={q.id}>
                    <dt className="muted t12">{q.label.replace("How would you rate the pain or discomfort right now?", "Pain or discomfort right now").replace("What brings you in today?", "What brings you in today?")}</dt>
                    <dd style={{ margin: "2px 0 0", fontWeight: 600 }}>
                      {q.type === "scale" ? `${visit.intake!.answers[q.id]} of ${q.max}` : String(visit.intake!.answers[q.id])}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted" style={{ marginTop: 10 }}>No intake submitted yet. Reason on arrival: {visit.reason}.</p>
            )}
            {visit.intake && <p className="hint" style={{ marginTop: 16 }}>Submitted {visit.intake.at} · structured answers only, no free text collected</p>}
          </section>

          <section className="card" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 16 }}>Clinical note <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>— staff only, never shown to the patient</span></h2>
            <textarea className="textarea" style={{ marginTop: 12, minHeight: 120 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the care team…" />
            <div className="flex gap8" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn btn-ghost" disabled={!dirty} onClick={() => setNote(saved)}>Discard</button>
              <button className="btn btn-primary" disabled={!dirty} onClick={() => { saveNote(visit.id, note.trim()); toast("Note saved"); }}>Save note</button>
            </div>
          </section>
        </div>

        <div className="flex col gap16">
          {visit.status === "waiting" && (
            <section className="card" style={{ padding: 22 }}>
              <p className="muted t13 flex center gap8"><Clock size={14} /> Estimated wait for this patient</p>
              <p style={{ fontSize: 26, fontWeight: 700, marginTop: 6, letterSpacing: -0.5 }}>{estimateFor(db, pos)}</p>
              <p className="hint" style={{ marginTop: 6 }}>Their phone shows the same figure, with the same label.</p>
              <Link href={`/q/${visit.id}`} target="_blank" className="btn btn-secondary sm" style={{ marginTop: 14 }}>See their phone</Link>
            </section>
          )}
          {visit.status !== "waiting" && (
            <section className="card" style={{ padding: 22 }}>
              <Link href={`/q/${visit.id}`} target="_blank" className="btn btn-secondary sm">See their phone</Link>
              {visit.feedback && (
                <p className="t13" style={{ marginTop: 14 }}>
                  <strong>Feedback:</strong> {"★".repeat(visit.feedback.rating)}{"☆".repeat(5 - visit.feedback.rating)}
                  {visit.feedback.comment ? ` — “${visit.feedback.comment}”` : ""}
                </p>
              )}
            </section>
          )}
          <section className="card" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 16 }}>Visit timeline</h2>
            <div className="timeline" style={{ marginTop: 16 }}>
              {timeline.map(([t, s, on]) => (
                <div key={t} className="tl-item">
                  <span className={`tl-dot ${on ? "on" : ""}`} />
                  <div>
                    <p className="t13 b6" style={{ opacity: on ? 1 : 0.6 }}>{t}</p>
                    <p className="muted t12">{s}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="card" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 16 }}>Consent</h2>
            <p className="t13 flex gap8" style={{ marginTop: 10, alignItems: "flex-start", color: p?.consent ? "var(--accent-d)" : "var(--ink-2)" }}>
              <ShieldCheck size={16} style={{ flex: "none", marginTop: 1 }} />
              {p?.consent ? `Record storage consented, ${p.consentDate ? shortDate(p.consentDate).replace(/ \d{4}$/, "") : ""}` : "Record storage not consented"}
            </p>
            <p className="hint" style={{ marginTop: 8 }}>Withdrawing consent removes visit history from the patient file but keeps today&apos;s queue entry.</p>
            {p?.consent && <button className="btn btn-ghost sm" style={{ marginTop: 12 }} onClick={() => setWithdraw(true)}>Withdraw consent</button>}
          </section>
        </div>
      </div>

      {cancel && (
        <Modal
          title="Cancel this visit?"
          onClose={() => setCancel(false)}
          small
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setCancel(false)}>Keep in queue</button>
              <button className="btn btn-danger" onClick={() => { cancelVisit(visit.id, "reception"); toast(`${name} removed from the queue`); setCancel(false); }}>Cancel visit</button>
            </>
          }
        >
          <p className="muted">Their phone will say the visit was cancelled by reception. This can&apos;t be undone.</p>
        </Modal>
      )}
      {withdraw && p && (
        <Modal
          title="Withdraw consent?"
          onClose={() => setWithdraw(false)}
          small
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setWithdraw(false)}>Keep consent</button>
              <button className="btn btn-danger" onClick={() => { setConsent(p.id, false); toast("Consent withdrawn"); setWithdraw(false); }}>Withdraw</button>
            </>
          }
        >
          <p className="muted">{name}&apos;s visit history will no longer be kept on their file. Today&apos;s queue entry stays.</p>
        </Modal>
      )}
    </>
  );
}
