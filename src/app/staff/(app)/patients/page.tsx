"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { Field, Modal, useToast } from "@/components/ui";
import { addPatient, fullName, lastVisitDay, lastVisitLabel, useDB } from "@/lib/store";
import { checkRsaId, fmtPhone, initials, validPhone } from "@/lib/util";
import { useRouter } from "next/navigation";

type F = "all" | "month" | "consent";

export default function Patients() {
  const db = useDB();
  const [q, setQ] = useState("");
  const [f, setF] = useState<F>("all");
  const [add, setAdd] = useState(false);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.patients
      .filter((p) => {
        if (f === "consent" && !p.consent) return false;
        if (f === "month" && !(lastVisitDay(db, p.id) ?? "").startsWith("2026-10")) return false;
        if (!s) return true;
        return `${p.first} ${p.last}`.toLowerCase().includes(s) || p.phone.replace(/\s/g, "").includes(s.replace(/\s/g, "")) || (p.idNumber ?? "").includes(s);
      })
      .sort((a, b) => (lastVisitDay(db, b.id) ?? "").localeCompare(lastVisitDay(db, a.id) ?? "") || a.last.localeCompare(b.last));
  }, [db, q, f]);

  const addedThisMonth = Math.max(12, 12 + db.patients.length - 18);
  return (
    <>
      <div className="page-h">
        <div>
          <h1>Patients</h1>
          <p>{(1284 + (db.patients.length - 18)).toLocaleString("en-ZA")} patient records · {addedThisMonth} added this month</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdd(true)}><UserPlus size={16} /> Add patient</button>
      </div>
      <div className="flex gap12 wrap center" style={{ marginBottom: 16 }}>
        <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 440 }}>
          <Search size={16} style={{ position: "absolute", left: 14, top: 16, color: "#94a3b8" }} />
          <input className="input" style={{ paddingLeft: 38 }} placeholder="Search by name, phone or ID number" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="seg">
          {([["all", "All"], ["month", "Seen this month"], ["consent", "Consent given"]] as [F, string][]).map(([k, l]) => (
            <button key={k} className={f === k ? "on" : ""} onClick={() => setF(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div className="pgrid qhead">
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)" }}>Patient</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)" }}>Phone</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)" }}>Last visit</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)" }}>Visits</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)" }}>Consent</span>
          </div>
          {rows.length === 0 && <p className="muted" style={{ padding: 28, textAlign: "center" }}>No patients match.</p>}
          {rows.map((p) => {
            const lv = lastVisitLabel(db, p.id);
            return (
              <Link key={p.id} href={`/staff/patients/${p.id}`} className="pgrid" style={{ color: "inherit" }}>
                <div className="flex center gap12">
                  <span className="avatar">{initials(p.first, p.last)}</span>
                  <div>
                    <p className="b6" style={{ fontSize: 14 }}>{fullName(p)}</p>
                    <p className="muted t12">{[p.age, p.summary].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
                <span className="muted t13">{fmtPhone(p.phone)}</span>
                <span className="t13" style={{ color: lv.includes("queue") || lv.includes("consultation") ? "var(--primary)" : "var(--ink-2)", fontWeight: lv.includes("queue") || lv.includes("consultation") ? 600 : 400 }}>{lv}</span>
                <span className="t13">{p.visitsBase}</span>
                <span className={`pill sm ${p.consent ? "good" : "neutral"}`} style={{ justifySelf: "start" }}>{p.consent ? "Given" : "Not given"}</span>
              </Link>
            );
          })}
        </div>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>Showing {rows.length} of {(1284 + (db.patients.length - 18)).toLocaleString("en-ZA")} · sorted by most recent visit. Demo data includes {db.patients.length} patients.</p>
      {add && <AddPatient onClose={() => setAdd(false)} />}
    </>
  );
}

function AddPatient({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [wa, setWa] = useState(true);
  const [idNo, setIdNo] = useState("");
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const idCheck = idNo.trim() ? checkRsaId(idNo) : null;
  const bad = !first.trim() || !last.trim() || !validPhone(phone) || (idCheck && !idCheck.ok);
  return (
    <Modal
      title="Add patient"
      sub="Creates a patient file. They are not added to the queue."
      onClose={onClose}
      small
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setTried(true);
              if (bad) return;
              const id = addPatient({ first: first.trim(), last: last.trim(), phone: phone.trim(), whatsapp: wa, idType: "RSA ID", idNumber: idNo.trim() || undefined, dob: idCheck?.dob, consent });
              toast("Patient file created");
              onClose();
              router.push(`/staff/patients/${id}`);
            }}
          >
            Create file
          </button>
        </>
      }
    >
      <div className="two-col">
        <Field label="First name *" error={tried && !first.trim() && "Required"}><input className="input sm" value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
        <Field label="Last name *" error={tried && !last.trim() && "Required"}><input className="input sm" value={last} onChange={(e) => setLast(e.target.value)} /></Field>
      </div>
      <Field label="Phone *" error={tried && !validPhone(phone) && "Enter a South African mobile number"}><input className="input sm" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></Field>
      <label className="check"><input type="checkbox" checked={wa} onChange={(e) => setWa(e.target.checked)} /> This is the patient&apos;s WhatsApp number</label>
      <Field label="RSA ID number (optional)" error={idCheck && !idCheck.ok && idCheck.msg} ok={idCheck?.ok && "Valid ID number"}>
        <input className="input sm" value={idNo} onChange={(e) => setIdNo(e.target.value)} inputMode="numeric" maxLength={13} />
      </Field>
      <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Patient consents to record storage</label>
    </Modal>
  );
}
