"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Laptop, Smartphone } from "lucide-react";
import { Field, Switch, useToast } from "@/components/ui";
import { saveProfile, signOut, useDB } from "@/lib/store";
import { initials, validPhone } from "@/lib/util";

export default function Profile() {
  const db = useDB();
  const toast = useToast();
  const router = useRouter();
  const p = db.profile;
  const [first, setFirst] = useState(p.first);
  const [last, setLast] = useState(p.last);
  const [mobile, setMobile] = useState(p.mobile);
  const [hpcsa, setHpcsa] = useState(p.hpcsa);
  const [synced, setSynced] = useState(false);
  const [pw, setPw] = useState(false);
  const [devices, setDevices] = useState(2);

  useEffect(() => {
    if (db.startedAt && !synced) {
      setFirst(p.first); setLast(p.last); setMobile(p.mobile); setHpcsa(p.hpcsa);
      setSynced(true);
    }
  }, [db.startedAt, p, synced]);

  const dirty = first !== p.first || last !== p.last || mobile !== p.mobile || hpcsa !== p.hpcsa;
  const bad = !first.trim() || !last.trim() || !validPhone(mobile);
  return (
    <>
      <div className="page-h">
        <div>
          <h1>My profile</h1>
          <p>{p.first} {p.last} · {p.role} · signed in on {devices} device{devices === 1 ? "" : "s"}</p>
        </div>
      </div>
      <div className="flex col gap16" style={{ maxWidth: 760 }}>
        <section className="card" style={{ padding: 24 }}>
          <div className="flex center gap16" style={{ marginBottom: 20 }}>
            <span className="avatar lg">{initials(p.first, p.last)}</span>
            <div>
              <p className="b6" style={{ fontSize: 17 }}>{p.first} {p.last}</p>
              <p className="muted t13">{p.email}</p>
              <span className="pill sm info" style={{ marginTop: 6 }}>{p.role}</span>
            </div>
          </div>
          <div className="two-col">
            <Field label="First name" error={!first.trim() && "Required"}><input className="input" value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
            <Field label="Last name" error={!last.trim() && "Required"}><input className="input" value={last} onChange={(e) => setLast(e.target.value)} /></Field>
            <Field label="Mobile number" error={!validPhone(mobile) && "Enter a South African mobile number"}><input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} /></Field>
            <Field label="HPCSA number"><input className="input" value={hpcsa} onChange={(e) => setHpcsa(e.target.value)} /></Field>
          </div>
          <div className="flex gap8" style={{ justifyContent: "flex-end", marginTop: 18 }}>
            <button className="btn btn-ghost" disabled={!dirty} onClick={() => { setFirst(p.first); setLast(p.last); setMobile(p.mobile); setHpcsa(p.hpcsa); }}>Discard</button>
            <button className="btn btn-primary" disabled={!dirty || bad} onClick={() => { saveProfile({ first: first.trim(), last: last.trim(), mobile: mobile.trim(), hpcsa: hpcsa.trim() }); toast("Profile saved"); }}>Save changes</button>
          </div>
        </section>

        <section className="card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 17 }}>Notifications</h2>
          <div className="flex center between gap16" style={{ padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
            <div><p className="b6 t13">Urgent walk-in added</p><p className="muted t12">Browser alert while the queue is open</p></div>
            <Switch on={p.alertWalkIn} label="Urgent walk-in alert" onChange={(v) => saveProfile({ alertWalkIn: v })} />
          </div>
          <div className="flex center between gap16" style={{ padding: "16px 0 0" }}>
            <div><p className="b6 t13">Daily summary</p><p className="muted t12">Emailed at 17:30 each weekday</p></div>
            <Switch on={p.dailySummary} label="Daily summary" onChange={(v) => saveProfile({ dailySummary: v })} />
          </div>
        </section>

        <section className="card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 17 }}>Security</h2>
          <div className="flex center between gap16" style={{ padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
            <div><p className="b6 t13">Password</p><p className="muted t12">{pw ? "Changed just now" : "Last changed 3 months ago"}</p></div>
            <button className="btn btn-secondary sm" onClick={() => { setPw(true); toast("Demo: password change email sent"); }}>Change</button>
          </div>
          <div className="flex center gap12" style={{ padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
            <Laptop size={20} color="#64748b" />
            <div className="grow"><p className="b6 t13">This device</p><p className="muted t12">Chrome on Windows · reception desk</p></div>
            <span className="pill sm good">Active</span>
          </div>
          {devices > 1 && (
            <div className="flex center gap12" style={{ padding: "16px 0" }}>
              <Smartphone size={20} color="#64748b" />
              <div className="grow"><p className="b6 t13">iPhone · Safari</p><p className="muted t12">Last used 2 days ago</p></div>
              <button className="btn btn-ghost sm" onClick={() => { setDevices(1); toast("Signed out of iPhone"); }}>Sign out</button>
            </div>
          )}
          <button className="btn btn-danger-soft" onClick={() => { signOut(); router.push("/staff/login"); }}>Sign out</button>
        </section>
      </div>
    </>
  );
}
