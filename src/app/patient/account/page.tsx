"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Download, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { Avatar, Btn, Field, Notice, Sheet } from "@/components/app/primitives";
import { RequireAuth } from "@/components/patient/RequireAuth";
import { useToast } from "@/components/ui";
import { downloadText } from "@/lib/format";
import { parseWhatsApp } from "@/lib/phone";
import { friendlyError, mutate, query, resetLocalDb } from "@/local/db";
import { useSession } from "@/local/auth";
import { useQuery } from "@/local/hooks";

export default function AccountPage() {
  return (
    <RequireAuth>
      <Account />
    </RequireAuth>
  );
}

function Account() {
  const { session, signOut } = useSession("patient");
  const uid = session!.userId;
  const router = useRouter();
  const toast = useToast();
  const profile = useQuery(() => query<{ display_name: string; phone: string | null }>(uid, "select display_name, phone from public.profiles where id = $1", [uid]).then((r) => r[0]), [uid]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (profile.data) { setName(profile.data.display_name); setPhone(profile.data.phone ?? ""); }
  }, [profile.data]);

  const dirty = profile.data && (name.trim() !== profile.data.display_name || phone.trim() !== (profile.data.phone ?? ""));

  async function save() {
    if (name.trim().length < 2) return toast("Please enter your name");
    const wa = parseWhatsApp(phone);
    if (!wa.ok) return toast(wa.message);
    setBusy(true);
    try {
      await mutate(uid, "update public.profiles set display_name = $2, phone = $3 where id = $1", [uid, name.trim(), wa.e164]);
      setPhone(wa.e164);
      const s = JSON.parse(localStorage.getItem("bb_session_patient") ?? "{}");
      localStorage.setItem("bb_session_patient", JSON.stringify({ ...s, name: name.trim() }));
      window.dispatchEvent(new Event("bb-session-change"));
      toast("Profile saved");
    } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
  }

  async function exportData() {
    const [p] = await query(uid, "select id, display_name, phone, created_at from public.profiles where id = $1", [uid]);
    const appts = await query(uid, "select id, status, starts_at, ends_at, practice_name, practitioner_name, service_name, price_cents from public.my_appointments()");
    downloadText("my-babyblue-data.json", "application/json", JSON.stringify({ exportedAt: new Date().toISOString(), account: { email: session!.email, ...p }, appointments: appts }, null, 2));
    toast("Your data was downloaded");
  }

  async function remove() {
    setBusy(true);
    try {
      await mutate(uid, "select public.delete_my_account()");
      signOut();
      toast("Your account was deleted");
      router.replace("/patient");
    } catch (e) { toast(friendlyError(e)); setBusy(false); }
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <h1 style={{ fontSize: 30 }}>Account</h1>
      <section className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Avatar name={name || session!.name} size={60} />
          <div><h2 style={{ fontSize: 19 }}>{session!.name}</h2><p style={{ color: "var(--ink-2)", fontSize: 14 }}>{session!.email}</p></div>
        </div>
        <Field label="Full name" htmlFor="n"><input id="n" className="a-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
        <Field label="WhatsApp number" htmlFor="p" hint="A mobile number that works on WhatsApp. Shared with a practice only when you book with them."><input id="p" className="a-input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="082 000 0000" /></Field>
        <div><Btn className="primary" disabled={!dirty} loading={busy} onClick={save}>Save changes</Btn></div>
      </section>

      <section className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 18, display: "flex", gap: 8, alignItems: "center" }}><ShieldCheck size={20} color="#1d6f86" /> Your data</h2>
        <p style={{ color: "var(--ink-2)", fontSize: 14.5 }}>You&apos;re in control. Download everything BabyBlue holds about you, or delete your account. Upcoming appointments are cancelled, and practices keep only the administrative record they need.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="a-btn secondary" onClick={exportData}><Download size={17} /> Download my data</button>
          <button className="a-btn danger" onClick={() => setDel(true)}><Trash2 size={17} /> Delete account</button>
        </div>
      </section>

      <section className="a-card pad" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="a-btn secondary" onClick={() => { signOut(); router.push("/patient"); }}><LogOut size={17} /> Sign out</button>
        <button className="a-btn ghost" onClick={() => resetLocalDb()}>Reset demo data</button>
      </section>

      {del && (
        <Sheet title="Delete your account?" sub="This can't be undone." onClose={() => setDel(false)} size="narrow"
          footer={<><button className="a-btn ghost" onClick={() => setDel(false)}>Keep my account</button><Btn className="danger-solid" disabled={confirm !== "DELETE"} loading={busy} onClick={remove}>Delete forever</Btn></>}>
          <Notice tone="warn">Upcoming appointments will be cancelled. Type <b>DELETE</b> to confirm.</Notice>
          <input className="a-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Type DELETE to confirm" placeholder="DELETE" />
        </Sheet>
      )}
    </div>
  );
}
