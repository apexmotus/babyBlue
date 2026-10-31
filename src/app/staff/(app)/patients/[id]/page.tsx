"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Download, MessageCircle, ShieldCheck } from "lucide-react";
import { Field, Modal, StatusPill, useToast } from "@/components/ui";
import { BookingModal } from "@/components/staff-modals";
import { addPatientNote, fullName, joinQueue, patientOf, setConsent, todays, updatePatient, useDB } from "@/lib/store";
import { TODAY, fmtPhone, initials, shortDate, validPhone } from "@/lib/util";

export default function PatientFile() {
  const { id } = useParams<{ id: string }>();
  const db = useDB();
  const toast = useToast();
  const p = patientOf(db, id);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [edit, setEdit] = useState(false);
  const [withdraw, setWithdraw] = useState(false);
  const [book, setBook] = useState(false);

  if (!p) {
    return (
      <>
        <Link href="/staff/patients" className="btn btn-ghost sm"><ArrowLeft size={14} /> Patients</Link>
        <div className="card" style={{ padding: 32, marginTop: 16, textAlign: "center" }}><p className="b6">Patient not found.</p></div>
      </>
    );
  }
  const visits = db.visits.filter((v) => v.patientId === p.id).sort((a, b) => b.day.localeCompare(a.day) || b.seq - a.seq);
  const upcoming = db.bookings.filter((b) => b.patientId === p.id).sort((a, b) => a.day.localeCompare(b.day));
  const live = todays(db).find((v) => v.patientId === p.id && (v.status === "waiting" || v.status === "in_consultation"));
  const count12 = Math.min(12, p.visitsBase);

  function exportFile() {
    if (!p) return;
    const blob = new Blob([JSON.stringify({ patient: p, visits, bookings: upcoming }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `patient-${p.last.toLowerCase()}-${p.first.toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Patient file exported");
  }

  return (
    <>
      <Link href="/staff/patients" className="btn btn-ghost sm" style={{ marginBottom: 20 }}><ArrowLeft size={14} /> Patients</Link>
      <div className="page-h">
        <div className="flex center gap16">
          <span className="avatar lg">{initials(p.first, p.last)}</span>
          <div>
            <h1 style={{ fontSize: 24 }}>{fullName(p)}</h1>
            <p style={{ marginTop: 2 }}>
              {[p.age ? `${p.age} years` : null, fmtPhone(p.phone), p.idType === "RSA ID" && p.idNumber ? `RSA ID ${p.idNumber.slice(0, 6)} ••••` : p.idType, p.medicalAid].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex gap8 wrap">
          <button className="btn btn-secondary" onClick={() => setEdit(true)}>Edit details</button>
          {live ? (
            <Link className="btn btn-primary" href={`/staff/visit/${live.id}`}>View today&apos;s visit</Link>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => {
                joinQueue({ first: p.first, last: p.last, phone: p.phone, whatsapp: p.whatsapp, idType: p.idType, idNumber: p.idNumber, source: "walk-in", reason: p.summary && !p.summary.includes("on file") ? p.summary : undefined });
                toast(`${p.first} added to today's queue`);
              }}
            >
              Add to today&apos;s queue
            </button>
          )}
        </div>
      </div>

      <div className="detail-grid">
        <div className="flex col gap16">
          <section className="card" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 16 }}>Visit history</h2>
            <div style={{ marginTop: 8 }}>
              {upcoming.map((b) => (
                <div key={b.id} className="flex center between gap12" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <p className="b6 t13">{shortDate(b.day)} · {b.time}</p>
                    <p className="muted t12">{b.reason} · {b.doctor}</p>
                  </div>
                  <span className="flex gap8"><span className="pill sm info">Upcoming</span><span className="pill sm neutral">Booked</span></span>
                </div>
              ))}
              {visits.map((v) => (
                <div key={v.id} className="flex center between gap12" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <p className="b6 t13">{v.day === TODAY ? "14 Oct 2026" : shortDate(v.day)}</p>
                    <p className="muted t12">{v.detail ?? `${v.reason}${v.doctor ? ` · ${v.doctor}` : ""}`}</p>
                  </div>
                  <span className="flex gap8">
                    <StatusPill status={v.status} className="sm" />
                    <span className="pill sm neutral">{v.kind}</span>
                  </span>
                </div>
              ))}
              {!visits.length && !upcoming.length && <p className="muted" style={{ padding: "16px 0" }}>No visits yet.</p>}
            </div>
            <div className="flex gap8" style={{ marginTop: 14 }}>
              <button className="btn btn-secondary sm" onClick={() => setBook(true)}>New booking</button>
            </div>
          </section>

          <section className="card" style={{ padding: 22 }}>
            <div className="flex between center">
              <h2 style={{ fontSize: 16 }}>Notes</h2>
              <button className="btn btn-secondary sm" onClick={() => setNoteOpen(true)}>Add note</button>
            </div>
            <div className="flex col gap16" style={{ marginTop: 14 }}>
              {p.notes.map((n) => (
                <div key={n.id} style={{ borderLeft: "3px solid var(--primary-50)", paddingLeft: 12 }}>
                  <p className="t13" style={{ lineHeight: 1.55 }}>{n.text}</p>
                  <p className="muted t12" style={{ marginTop: 4 }}>{n.by} · {shortDate(n.date)}</p>
                </div>
              ))}
              {!p.notes.length && <p className="muted t13">No notes yet.</p>}
            </div>
          </section>
        </div>

        <div className="flex col gap16">
          <section className="card" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 16 }}>Contact</h2>
            <dl style={{ margin: "12px 0 0", display: "flex", flexDirection: "column", gap: 12 }} className="t13">
              <div><dt className="muted t12">Mobile</dt><dd style={{ margin: 0, fontWeight: 600 }} className="flex center gap8">{fmtPhone(p.phone)} {p.whatsapp && <span className="pill sm good"><MessageCircle size={11} /> WhatsApp</span>}</dd></div>
              {p.email && <div><dt className="muted t12">Email</dt><dd style={{ margin: 0, fontWeight: 600 }}>{p.email}</dd></div>}
              {p.address && <div><dt className="muted t12">Address</dt><dd style={{ margin: 0, fontWeight: 600 }}>{p.address}</dd></div>}
              {p.nextOfKin && <div><dt className="muted t12">Next of kin</dt><dd style={{ margin: 0, fontWeight: 600 }}>{p.nextOfKin}</dd></div>}
            </dl>
          </section>
          <section className="card" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 16 }}>Visit pattern</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 14 }}>
              <div><p style={{ fontSize: 24, fontWeight: 700 }}>{count12}</p><p className="muted t12">Visits in 12 months</p></div>
              <div><p style={{ fontSize: 24, fontWeight: 700 }}>{18 + (p.visitsBase % 14)} min</p><p className="muted t12">Average time waited</p></div>
              <div><p style={{ fontSize: 24, fontWeight: 700 }}>{visits.filter((v) => v.status === "cancelled").length}</p><p className="muted t12">Missed appointments</p></div>
            </div>
          </section>
          <section className="card" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 16 }}>POPIA</h2>
            <p className="t13 flex gap8" style={{ marginTop: 10, alignItems: "flex-start", color: p.consent ? "var(--accent-d)" : "var(--ink-2)", fontWeight: 600 }}>
              <ShieldCheck size={16} style={{ flex: "none", marginTop: 1 }} />
              {p.consent ? "Record storage consented" : "No consent to store records"}
            </p>
            <p className="hint" style={{ marginTop: 6 }}>
              {p.consent ? `Given ${p.consentDate ? shortDate(p.consentDate) : ""} at this practice. Patient can withdraw at any time.` : "Only today's queue entry is kept. Ask the patient if they'd like their history stored."}
            </p>
            <div className="flex gap8 wrap" style={{ marginTop: 14 }}>
              <button className="btn btn-secondary sm" onClick={exportFile}><Download size={14} /> Export file</button>
              {p.consent ? (
                <button className="btn btn-ghost sm" onClick={() => setWithdraw(true)}>Withdraw consent</button>
              ) : (
                <button className="btn btn-accent sm" onClick={() => { setConsent(p.id, true); toast("Consent recorded"); }}>Record consent</button>
              )}
            </div>
          </section>
        </div>
      </div>

      {noteOpen && (
        <Modal
          title="Add note"
          sub="Visible to staff only."
          onClose={() => setNoteOpen(false)}
          small
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setNoteOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!note.trim()} onClick={() => { addPatientNote(p.id, note.trim()); setNote(""); setNoteOpen(false); toast("Note added"); }}>Save note</button>
            </>
          }
        >
          <textarea className="textarea" autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Prefers morning appointments." />
        </Modal>
      )}
      {withdraw && (
        <Modal
          title="Withdraw consent?"
          onClose={() => setWithdraw(false)}
          small
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setWithdraw(false)}>Keep consent</button>
              <button className="btn btn-danger" onClick={() => { setConsent(p.id, false); setWithdraw(false); toast("Consent withdrawn"); }}>Withdraw</button>
            </>
          }
        >
          <p className="muted">Visit history will no longer be kept on {p.first}&apos;s file. Today&apos;s queue entry stays.</p>
        </Modal>
      )}
      {edit && <EditPatient key={p.id} id={p.id} onClose={() => setEdit(false)} />}
      {book && <BookingModal patientId={p.id} onClose={() => setBook(false)} />}
    </>
  );
}

function EditPatient({ id, onClose }: { id: string; onClose: () => void }) {
  const db = useDB();
  const toast = useToast();
  const p = patientOf(db, id)!;
  const [first, setFirst] = useState(p.first);
  const [last, setLast] = useState(p.last);
  const [phone, setPhone] = useState(p.phone);
  const [wa, setWa] = useState(p.whatsapp);
  const [email, setEmail] = useState(p.email ?? "");
  const [address, setAddress] = useState(p.address ?? "");
  const [kin, setKin] = useState(p.nextOfKin ?? "");
  const [aid, setAid] = useState(p.medicalAid ?? "");
  const [tried, setTried] = useState(false);
  return (
    <Modal
      title="Edit details"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setTried(true);
              if (!first.trim() || !last.trim() || !validPhone(phone)) return;
              updatePatient(id, { first: first.trim(), last: last.trim(), phone: phone.trim(), whatsapp: wa, email: email.trim() || undefined, address: address.trim() || undefined, nextOfKin: kin.trim() || undefined, medicalAid: aid.trim() || undefined });
              toast("Details updated");
              onClose();
            }}
          >
            Save changes
          </button>
        </>
      }
    >
      <div className="two-col">
        <Field label="First name" error={tried && !first.trim() && "Required"}><input className="input sm" value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
        <Field label="Last name" error={tried && !last.trim() && "Required"}><input className="input sm" value={last} onChange={(e) => setLast(e.target.value)} /></Field>
      </div>
      <Field label="Mobile" error={tried && !validPhone(phone) && "Enter a South African mobile number"}><input className="input sm" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      <label className="check"><input type="checkbox" checked={wa} onChange={(e) => setWa(e.target.checked)} /> WhatsApp number</label>
      <Field label="Email"><input className="input sm" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Address"><input className="input sm" value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
      <Field label="Next of kin"><input className="input sm" value={kin} onChange={(e) => setKin(e.target.value)} placeholder="Name · phone" /></Field>
      <Field label="Medical aid"><input className="input sm" value={aid} onChange={(e) => setAid(e.target.value)} /></Field>
    </Modal>
  );
}
