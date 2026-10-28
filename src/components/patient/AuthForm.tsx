"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { BadgeCheck, CalendarClock, ShieldCheck } from "lucide-react";
import { Avatar, Btn, Field, Notice } from "@/components/app/primitives";
import { AuthError, signIn, signUp, type AppKey } from "@/local/auth";

const DEMO = [
  { email: "lerato.ndlovu@demo.babyblue", name: "Lerato Ndlovu", note: "Has upcoming and past appointments" },
  { email: "mark.jacobs@demo.babyblue", name: "Mark Jacobs", note: "A second patient" },
];

function Inner({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/patient";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pw, setPw] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go(e: string, p: string, n?: string, wa?: string) {
    setBusy(true);
    setError("");
    try {
      if (mode === "signup" && n !== undefined) {
        if (!agree) throw new AuthError("Please agree to the privacy notice to create your account.");
        await signUp("patient" as AppKey, e, p, n, wa);
      } else await signIn("patient" as AppKey, e, p);
      router.replace(next);
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="pt-auth">
      <div className="pt-auth-art">
        <h2>Your next appointment, a few taps away.</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14, color: "var(--deep)", fontWeight: 600 }}>
          <li style={{ display: "flex", gap: 12, alignItems: "center" }}><CalendarClock size={22} /> Real availability, held while you book</li>
          <li style={{ display: "flex", gap: 12, alignItems: "center" }}><BadgeCheck size={22} /> Verification you can see</li>
          <li style={{ display: "flex", gap: 12, alignItems: "center" }}><ShieldCheck size={22} /> Delete your account any time</li>
        </ul>
      </div>
      <div className="pt-auth-form">
        <div>
          <div>
            <h1 style={{ fontSize: 30 }}>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
            <p style={{ color: "var(--ink-2)", marginTop: 4 }}>{mode === "login" ? "Sign in to manage your appointments." : "Just your name, email and WhatsApp number. It takes under a minute."}</p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); go(email, pw, mode === "signup" ? name : undefined, mode === "signup" ? phone : undefined); }} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
            {mode === "signup" && <Field label="Full name" htmlFor="name"><input id="name" className="a-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>}
            <Field label="Email" htmlFor="email"><input id="email" type="email" className="a-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" /></Field>
            {mode === "signup" && <Field label="WhatsApp number" htmlFor="wa" hint="A mobile number that works on WhatsApp. Practices use it to confirm your booking."><input id="wa" type="tel" className="a-input" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" placeholder="082 431 9087" /></Field>}
            <Field label="Password" htmlFor="pw" hint={mode === "signup" ? "At least 8 characters." : undefined}><input id="pw" type="password" className="a-input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /></Field>
            {mode === "signup" && (
              <label className="a-check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>I agree to the <Link href="/popia" target="_blank">privacy notice</Link>. BabyBlue shares my name, email and WhatsApp number only with practices I book with. We never ask for ID numbers or other sensitive details.</span></label>
            )}
            {error && <Notice tone="bad">{error}</Notice>}
            <Btn type="submit" className="primary lg block" loading={busy}>{mode === "login" ? "Sign in" : "Create account"}</Btn>
          </form>
          <p style={{ textAlign: "center", color: "var(--ink-2)", fontSize: 14.5 }}>
            {mode === "login" ? <>New to BabyBlue? <Link href={`/patient/signup?next=${encodeURIComponent(next)}`} className="a-link">Create an account</Link></> : <>Already have an account? <Link href={`/patient/login?next=${encodeURIComponent(next)}`} className="a-link">Sign in</Link></>}
          </p>
          <hr className="a-divider" />
          <div className="pt-demo-accts">
            <p className="a-hint" style={{ fontWeight: 600, color: "#6b4700" }}>Demo accounts (fictional, one click)</p>
            {DEMO.map((d) => (
              <button key={d.email} type="button" className="pt-demo-acct" onClick={() => go(d.email, "demo1234")}>
                <Avatar name={d.name} size={36} />
                <span><b style={{ color: "var(--deep)" }}>{d.name}</b><br /><span style={{ color: "var(--ink-3)", fontSize: 13 }}>{d.note}</span></span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  return (
    <Suspense fallback={null}>
      <Inner mode={mode} />
    </Suspense>
  );
}
