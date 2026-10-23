import Link from "next/link";
import { Logo } from "@/components/ui";

export const metadata = { title: "POPIA position — BabyBlue demo" };

export default function Popia() {
  return (
    <>
      <header className="mk-nav">
        <div className="container">
          <Logo />
          <Link className="btn btn-secondary sm" href="/">Back</Link>
        </div>
      </header>
      <main className="container" style={{ maxWidth: 720, padding: "48px 24px 96px" }}>
        <h1 style={{ fontSize: 32, letterSpacing: -0.9 }}>How BabyBlue handles patient information</h1>
        <p className="muted" style={{ marginTop: 8 }}>Demo summary — not a legal document.</p>
        {[
          ["What we keep", "A name, a contact number, and an ID number only where a patient consents to record storage. Intake answers are structured categories — no free text."],
          ["Who sees it", "Only the practice the patient visits. Reception and clinicians see a patient's queue entry, intake answers and notes for that practice."],
          ["Messages", "WhatsApp and SMS carry the practice name, queue position and estimate. They never contain a reason for the visit, an intake answer or a diagnosis."],
          ["Consent", "Record storage is opt-in at the point of joining. A patient can withdraw it at any time; withdrawing removes visit history from the patient file but keeps the day's queue entry."],
          ["Roles", "BabyBlue acts as an operator for the practice, which is the responsible party. Each practice signs an operator agreement before going live."],
        ].map(([h, p]) => (
          <section key={h} style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 18 }}>{h}</h2>
            <p className="muted" style={{ marginTop: 6, lineHeight: 1.65 }}>{p}</p>
          </section>
        ))}
      </main>
    </>
  );
}
