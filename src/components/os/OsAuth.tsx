"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BarChart3, CalendarDays, ListChecks, Megaphone } from "lucide-react";
import { Avatar, Btn, Field, Notice } from "@/components/app/primitives";
import { Logo } from "@/components/ui";
import { AuthError, signIn, signUp } from "@/local/auth";

const DEMO = [
  { email: "rosebank@demo.babyblue", name: "Dr Naledi Mokoena", note: "Owner · Rosebank Family Practice (busiest data)" },
  { email: "busi@demo.babyblue", name: "Busi Radebe", note: "Receptionist · Rosebank (limited access)" },
  { email: "parkview@demo.babyblue", name: "Dr Sipho Dlamini", note: "Owner · Parkview Dental Studio" },
  { email: "sandton@demo.babyblue", name: "Dr Rebecca Mahlangu", note: "Owner · practice awaiting activation" },
  { email: "ops@demo.babyblue", name: "Growth Operator", note: "Marketing operator (BabyBlue Growth)" },
  { email: "admin@demo.babyblue", name: "Platform Admin", note: "Activates practices, verifies practitioners" },
];

export function OsAuth({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go(e: string, p: string, n?: string) {
    setBusy(true);
    setError("");
    try {
      if (mode === "signup" && n !== undefined) await signUp("practice", e, p, n);
      else await signIn("practice", e, p);
      router.replace("/practice");
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", minHeight: "100dvh" }} className="os-auth">
      <div style={{ background: "linear-gradient(160deg, #14364b, #0d2a3b)", color: "#fff", padding: "48px 56px", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", width: 520, height: 520, borderRadius: "50%", right: -180, top: -160, background: "radial-gradient(circle, rgba(48,151,178,.5), rgba(48,151,178,0) 70%)" }} />
        <div style={{ position: "relative" }}><Logo light size={38} href="/" /> <span style={{ marginLeft: 6, fontWeight: 700, letterSpacing: ".1em", fontSize: 12, color: "rgba(255,255,255,.6)" }}>OS</span></div>
        <div style={{ position: "relative", maxWidth: 480 }}>
          <h2 style={{ color: "#fff", fontSize: "clamp(2rem, 3.2vw, 3rem)", lineHeight: 1.05, letterSpacing: "-0.035em" }}>More time for your practice. More room to grow.</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: "28px 0 0", display: "flex", flexDirection: "column", gap: 16 }}>
            {[[CalendarDays, "A calendar that knows your hours, leave and services"], [ListChecks, "Check-ins and a live queue for reception"], [BarChart3, "Insights calculated from your real bookings"], [Megaphone, "Marketing services, requested without leaving the app"]].map(([I, t]) => {
              const Ic = I as typeof CalendarDays;
              return <li key={t as string} style={{ display: "flex", gap: 14, alignItems: "center", color: "rgba(255,255,255,.88)", fontWeight: 500 }}><span style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(189,230,239,.14)", display: "grid", placeItems: "center", flex: "none" }}><Ic size={19} color="#bde6ef" /></span>{t as string}</li>;
            })}
          </ul>
        </div>
        <p style={{ position: "relative", fontSize: 13, color: "rgba(255,255,255,.55)" }}>Demo environment. All data is fictional and stays in your browser.</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", background: "var(--cloud)" }}>
        <div style={{ width: "100%", maxWidth: 430, display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <h1 style={{ fontSize: 30 }}>{mode === "login" ? "Sign in to BabyBlue OS" : "Create your practice account"}</h1>
            <p style={{ color: "var(--ink-2)", marginTop: 4 }}>{mode === "login" ? "Welcome back." : "You'll set up your practice in a few minutes."}</p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); go(email, pw, mode === "signup" ? name : undefined); }} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
            {mode === "signup" && <Field label="Your name" htmlFor="name"><input id="name" className="a-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>}
            <Field label="Work email" htmlFor="email"><input id="email" type="email" className="a-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" /></Field>
            <Field label="Password" htmlFor="pw" hint={mode === "signup" ? "At least 8 characters." : undefined}><input id="pw" type="password" className="a-input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /></Field>
            {error && <Notice tone="bad">{error}</Notice>}
            <Btn type="submit" className="primary lg block" loading={busy}>{mode === "login" ? "Sign in" : "Create account"}</Btn>
          </form>
          <p style={{ textAlign: "center", color: "var(--ink-2)", fontSize: 14.5 }}>
            {mode === "login" ? <>New practice? <Link href="/practice/signup" className="a-link">Create an account</Link></> : <>Already registered? <Link href="/practice/login" className="a-link">Sign in</Link></>}
          </p>
          <hr className="a-divider" />
          <div className="pt-demo-accts">
            <p className="a-hint" style={{ fontWeight: 600, color: "#6b4700" }}>Demo accounts (fictional, one click)</p>
            {DEMO.map((d) => (
              <button key={d.email} type="button" className="pt-demo-acct" onClick={() => go(d.email, "demo1234")}>
                <Avatar name={d.name} size={34} />
                <span><b style={{ color: "var(--deep)" }}>{d.name}</b><br /><span style={{ color: "var(--ink-3)", fontSize: 12.5 }}>{d.note}</span></span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 900px) { .os-auth { grid-template-columns: 1fr !important; } .os-auth > :first-child { display: none; } }`}</style>
    </div>
  );
}
