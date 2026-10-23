"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarCheck, Clock, MessageCircle, Plus, QrCode, ShieldCheck, Users, Smartphone, Bell } from "lucide-react";
import { Logo, Modal, Field, useToast } from "@/components/ui";
import { DEMO_VISIT_ID } from "@/lib/seed";
import { estimateFor, positionOf, useDB, visitById, waitingList } from "@/lib/store";
import { validPhone } from "@/lib/util";

type Variant = "gp" | "dentist" | "clinic";

const VARIANTS: Record<Variant, { tab: string; badge: string; h1: string; lead: string; cta2: string; cta2href: string }> = {
  gp: {
    tab: "General practice",
    badge: "General practice",
    h1: "Stop making patients sit in a waiting room to hold their place.",
    lead: "Patients scan a code, join the queue from their phone, and get a WhatsApp or SMS when it's nearly their turn. Your front desk keeps one live list.",
    cta2: "See a live queue demo",
    cta2href: "/c/rosebank-family",
  },
  dentist: {
    tab: "Dental practice",
    badge: "Dental practice",
    h1: "Booked chairs, filled gaps, fewer no-shows.",
    lead: "Dentistry runs on the diary, not the door. BabyBlue confirms by WhatsApp, keeps a live standby list, and offers the next cancellation to the person most likely to take it.",
    cta2: "See the standby list",
    cta2href: "#dentist-demo",
  },
  clinic: {
    tab: "Small clinic",
    badge: "Small clinic",
    h1: "One queue, several rooms, no shouting down the corridor.",
    lead: "Nurses, GPs and a treatment room can share one live list or split it. Everyone on shift sees the same order.",
    cta2: "Talk to us on WhatsApp",
    cta2href: "#whatsapp",
  },
};

const FAQ = [
  ["Does a patient need data to join?", "A patient needs a phone and a signal to scan the code and join. The status page is light, and if the connection drops the place is held and the screen catches up on its own."],
  ["What happens if the internet drops?", "At the practice, reception keeps working from the last list and syncs when the connection returns. On the patient's phone you will see an offline banner — their place is held."],
  ["Where is patient data stored?", "Per practice, and only for the practice a patient visits. We process it as an operator under POPIA and keep a name, a contact number and an ID number only where a patient consents to record storage."],
  ["Can we keep paper files too?", "Yes. BabyBlue runs the queue and a light patient list alongside whatever clinical system or paper files you already use."],
];

export default function Landing() {
  const [variant, setVariant] = useState<Variant>("gp");
  const [book, setBook] = useState(false);
  const v = VARIANTS[variant];
  return (
    <>
      <header className="mk-nav">
        <div className="container">
          <Logo />
          <nav>
            <Link href="/find" className="hide-sm">Find a clinic</Link>
            <a href="#how" className="hide-sm">How it works</a>
            <Link href="/staff/login" className="hide-sm">For clinics</Link>
            <button className="btn btn-primary sm" onClick={() => setBook(true)}>Book a walkthrough</button>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="container">
            <div className="seg" role="tablist" aria-label="Practice type" style={{ marginBottom: 28 }}>
              {(Object.keys(VARIANTS) as Variant[]).map((k) => (
                <button key={k} role="tab" aria-selected={variant === k} className={variant === k ? "on" : ""} onClick={() => setVariant(k)}>
                  {VARIANTS[k].tab}
                </button>
              ))}
            </div>
            <div className="hero-grid">
              <div>
                <span className="eyebrow">{v.badge}</span>
                <h1>{v.h1}</h1>
                <p className="lead">{v.lead}</p>
                <div className="flex gap12 wrap" style={{ marginTop: 28 }}>
                  <button className="btn btn-primary lg" onClick={() => setBook(true)}>Book a 15-minute walkthrough</button>
                  {v.cta2href.startsWith("/") ? (
                    <Link className="btn btn-secondary lg" href={v.cta2href}>{v.cta2}</Link>
                  ) : (
                    <a className="btn btn-secondary lg" href={v.cta2href}>{v.cta2}</a>
                  )}
                </div>
                <div className="flex gap16 wrap" style={{ marginTop: 36 }}>
                  <div>
                    <p style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.8 }}>31%</p>
                    <p className="muted t13">fewer people in the waiting room at peak</p>
                  </div>
                  <div style={{ width: 1, background: "var(--border)" }} />
                  <div>
                    <p style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.8 }}>4 min</p>
                    <p className="muted t13">to set up your practice and print a code</p>
                  </div>
                </div>
              </div>
              <div>{variant === "dentist" ? <DentistCard /> : variant === "clinic" ? <StreamsCard /> : <LivePhone />}</div>
            </div>
          </div>
        </section>

        {variant === "dentist" && (
          <section className="section" id="dentist-demo" style={{ background: "#fff", borderTop: "1px solid var(--border)" }}>
            <div className="container">
              <h2>Built for a dental diary</h2>
              <div className="grid3" style={{ marginTop: 28 }}>
                {[
                  [Users, "Standby list", "A cancellation goes out to the standby list in order, not as a scramble of phone calls."],
                  [Clock, "Procedure-length slots", "Set an average duration per procedure type; estimates follow it."],
                  [Bell, "Reminders that get read", "WhatsApp first, SMS if the number isn't on WhatsApp."],
                ].map(([Ic, t, d]) => {
                  const I = Ic as typeof Users;
                  return (
                    <div key={t as string} className="card" style={{ padding: 22 }}>
                      <I size={22} color="#0b5aa8" />
                      <h3 style={{ fontSize: 16, marginTop: 12 }}>{t as string}</h3>
                      <p className="muted" style={{ marginTop: 6 }}>{d as string}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        <section className="section" id="how" style={{ background: "#fff", borderTop: "1px solid var(--border)" }}>
          <div className="container">
            <h2>How it works</h2>
            <div className="steps">
              {[
                ["Print the code, stick it at reception", "One QR per practice. No app for anyone to install.", QrCode],
                ["Patients join with a name and number", "Optional short intake so the doctor reads before the door opens.", Smartphone],
                ["Reception calls the next person", "Everyone's phone updates in the same second.", MessageCircle],
              ].map(([t, d, Ic], i) => {
                const I = Ic as typeof QrCode;
                return (
                  <div key={i} className="card" style={{ padding: 24 }}>
                    <div className="flex center between">
                      <span className="step-n">{i + 1}</span>
                      <I size={22} color="#64748b" />
                    </div>
                    <h3 style={{ fontSize: 17, marginTop: 16 }}>{t as string}</h3>
                    <p className="muted" style={{ marginTop: 6 }}>{d as string}</p>
                  </div>
                );
              })}
            </div>
            <div className="flex gap12 wrap center" style={{ marginTop: 28 }}>
              <Link className="btn btn-primary" href="/c/rosebank-family">Try the patient side</Link>
              <Link className="btn btn-secondary" href="/staff/login">Try the front-desk side</Link>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container" style={{ maxWidth: 760 }}>
            <h2>Common questions</h2>
            <div className="faq" style={{ marginTop: 16 }}>
              {FAQ.map(([q, a]) => (
                <details key={q}>
                  <summary>
                    {q}
                    <Plus size={18} style={{ transition: "transform .15s", flex: "none" }} />
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
            <div className="banner neutral" style={{ marginTop: 28 }} id="whatsapp">
              <ShieldCheck size={18} />
              <div>
                Patient details are processed under POPIA. We keep a name, a contact number and an ID number only where a patient consents to record storage — and only for the practice they visit.{" "}
                <Link href="/popia">Read our POPIA position</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container flex between wrap gap12">
          <span>© 2026 BabyBlue · Interactive demo — every name, number and figure is made up.</span>
          <span className="flex gap16">
            <Link href="/popia">POPIA</Link>
            <Link href="/staff/login">Staff sign in</Link>
          </span>
        </div>
      </footer>

      {book && <WalkthroughModal onClose={() => setBook(false)} />}
    </>
  );
}

function LivePhone() {
  const db = useDB();
  const demo = visitById(db, DEMO_VISIT_ID);
  const first = demo && demo.status === "waiting" ? demo : waitingList(db)[0];
  const pos = first ? positionOf(db, first.id) : 0;
  return (
    <div className="phone" aria-label="A patient's phone, right now">
      <div className="phone-in">
        <p className="muted t12" style={{ textAlign: "center" }}>A patient&apos;s phone, right now</p>
        <div className="card r16" style={{ padding: 20, textAlign: "center" }}>
          <span className="pill waiting">Waiting</span>
          <p className="big-num" style={{ marginTop: 18, fontSize: 48 }}>{pos ? `#${pos}` : "—"}</p>
          <p className="muted t13" style={{ marginTop: 6 }}>in line</p>
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            <p className="muted t12">Estimated wait</p>
            <p style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{pos ? estimateFor(db, pos) : "—"}</p>
          </div>
        </div>
        <div className="flex center gap8" style={{ justifyContent: "center" }}>
          <span className="live-dot" />
          <span className="muted t12">Updated just now</span>
        </div>
      </div>
    </div>
  );
}

function DentistCard() {
  const rows: [string, string, string, string][] = [
    ["09:00", "Scale and polish · L. Mokoena", "Confirmed", "good"],
    ["09:40", "Cancelled — offered to 3 on standby", "Open", "warn"],
    ["10:20", "Filling · S. Khumalo", "Confirmed", "good"],
  ];
  return (
    <div className="card r16" style={{ padding: 22 }}>
      <p className="b6">Today&apos;s chair, 14 October</p>
      <div className="flex col" style={{ marginTop: 14 }}>
        {rows.map(([t, d, s, tone]) => (
          <div key={t} className="flex center gap12" style={{ padding: "12px 0", borderTop: "1px solid var(--border)" }}>
            <span className="mono b6" style={{ width: 48 }}>{t}</span>
            <span className="grow t13">{d}</span>
            <span className={`pill sm ${tone}`}>{s}</span>
          </div>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 12, display: "flex", gap: 6, alignItems: "center" }}>
        <CalendarCheck size={14} /> Illustrative diary — the live queue demo is on the general-practice tab.
      </p>
    </div>
  );
}

function StreamsCard() {
  const streams: [string, number][] = [["Nurse", 7], ["GP", 4], ["Dressings", 2]];
  return (
    <div className="card r16" style={{ padding: 22 }}>
      <p className="b6">Three streams, one order</p>
      <div className="flex gap12" style={{ marginTop: 16 }}>
        {streams.map(([n, c]) => (
          <div key={n} className="grow" style={{ background: "var(--bg)", borderRadius: 12, padding: 16, textAlign: "center", border: "1px solid var(--border)" }}>
            <p style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1 }}>{c}</p>
            <p className="muted t13">{n}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WalkthroughModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [tried, setTried] = useState(false);
  const bad = !name.trim() || !validPhone(phone);
  return (
    <Modal
      title="Book a 15-minute walkthrough"
      sub="Leave a number and we'll WhatsApp you a time."
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
              toast("Thanks — demo only, nothing was sent");
              onClose();
            }}
          >
            Request a walkthrough
          </button>
        </>
      }
    >
      <Field label="Your name" error={tried && !name.trim() && "Enter your name"}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Naledi Mokoena" />
      </Field>
      <Field label="WhatsApp number" error={tried && !validPhone(phone) && "Enter a South African mobile number"}>
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="083 204 7712" />
      </Field>
    </Modal>
  );
}
