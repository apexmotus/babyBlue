"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Field, Modal, useToast } from "@/components/ui";
import { inviteStaff, useDB } from "@/lib/store";
import { initials } from "@/lib/util";

export default function StaffPage() {
  const db = useDB();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"Reception" | "Clinician">("Reception");
  const [tried, setTried] = useState(false);
  const badEmail = !/^\S+@\S+\.\S+$/.test(email);
  return (
    <div style={{ maxWidth: 760 }}>
      <section className="card" style={{ padding: 24 }}>
        <div className="flex between center gap12 wrap">
          <div>
            <h2 style={{ fontSize: 17 }}>Staff accounts</h2>
            <p className="muted t13" style={{ marginTop: 4 }}>Admins change settings and add staff. Reception runs the queue. Clinicians see the queue and patient notes.</p>
          </div>
          <button className="btn btn-secondary" onClick={() => setOpen(true)}><UserPlus size={16} /> Invite staff</button>
        </div>
        <div className="flex col" style={{ marginTop: 14 }}>
          {db.settings.staff.map((m) => (
            <div key={m.id} className="flex center gap12" style={{ padding: "14px 0", borderTop: "1px solid var(--border)" }}>
              <span className="avatar">{initials(m.name.split(" ")[0] === "Dr" ? m.name.split(" ")[1] : m.name.split(" ")[0], m.name.split(" ").slice(-1)[0])}</span>
              <div className="grow">
                <p className="b6 t13">{m.name}</p>
                <p className="muted t12">{m.email}</p>
              </div>
              <span className={`pill sm ${m.role === "Admin" ? "info" : "neutral"}`}>{m.role}</span>
              <span className="muted t12" style={{ width: 90, textAlign: "right" }}>{m.last}</span>
            </div>
          ))}
        </div>
      </section>
      {open && (
        <Modal
          title="Invite staff"
          onClose={() => setOpen(false)}
          small
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setTried(true);
                  if (!name.trim() || badEmail) return;
                  inviteStaff(name.trim(), email.trim(), role);
                  toast(`Invite sent to ${email.trim()}`);
                  setName(""); setEmail(""); setTried(false); setOpen(false);
                }}
              >
                Send invite
              </button>
            </>
          }
        >
          <Field label="Full name" error={tried && !name.trim() && "Required"}><input className="input sm" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Email" error={tried && badEmail && "Enter a valid email"}><input className="input sm" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Role">
            <select className="select sm" value={role} onChange={(e) => setRole(e.target.value as "Reception" | "Clinician")}>
              <option>Reception</option>
              <option>Clinician</option>
            </select>
          </Field>
        </Modal>
      )}
    </div>
  );
}
