import Link from "next/link";
import { Bell, Clock, EyeOff, MonitorCheck, QrCode, Smartphone, UserCheck } from "lucide-react";
import { CtaBand, Faq, Head, PageHero, Section } from "@/components/site/blocks";
import { pageMeta } from "@/lib/meta";

export const metadata = pageMeta("BabyBlue Flow — QR check-in and live queue management", "QR-code check-in, arrival tracking and a live queue for reception, with privacy-safe status messages and honest waiting-time ranges.", "/flow");

const FAQ = [
  ["Does a patient need to install an app?", "No. Patients scan a QR code and use a simple web page. Nothing to download."],
  ["What do patients' messages say?", "The practice name, the patient's queue position or appointment time, and an estimate where reliable. Never a reason for the visit, an intake answer or a diagnosis."],
  ["How are waiting times estimated?", "As a range, from the practice's own average consult length and the live queue. We label them \"Estimated\", never present them as a promise or booked time, and will hide them when there isn't enough data to be reliable."],
  ["Can it work for booked patients too?", "Yes. Booked patients check in on arrival and join the live queue in the right place, so walk-ins and appointments share one list."],
  ["What if the internet drops?", "The patient's phone shows that it's reconnecting and that their place is held. It catches up automatically when the connection returns."],
] as const;

export default function Flow() {
  return (
    <>
      <PageHero
        eyebrow="BabyBlue Flow"
        title={<>Calmer waiting rooms. <span className="x-accent">Clearer front desks.</span></>}
        lead="Patients check in with a QR code and wait wherever suits them. Reception sees one live list. Everyone knows what's happening, without sharing private details."
        actions={<><Link className="x-btn x-btn-primary" href="/staff/login">Try the reception demo</Link><Link className="x-btn x-btn-outline" href="/c/rosebank-family">Try the patient demo</Link></>}
        aside={
          <div className="x-card" style={{ padding: 28 }}>
            <span className="x-chip dev">Working demonstration · fictional data</span>
            <ol className="x-list" style={{ marginTop: 18 }}>
              <li><span className="x-icon round deep" style={{ width: 36, height: 36 }}>1</span><div><strong>Open reception</strong><span>Sign in is pre-filled. Just press Sign in.</span></div></li>
              <li><span className="x-icon round deep" style={{ width: 36, height: 36 }}>2</span><div><strong>Open a patient&apos;s phone in another tab</strong><span>Use the Demo button, then &ldquo;Open Thabo&apos;s phone&rdquo;.</span></div></li>
              <li><span className="x-icon round deep" style={{ width: 36, height: 36 }}>3</span><div><strong>Press Call next</strong><span>Watch the patient screen change instantly.</span></div></li>
            </ol>
          </div>
        }
      />

      <Section tone="white">
        <Head eyebrow="What Flow does" title="Check-in, queue and notifications, working together." />
        <div className="x-grid x-g3">
          {[
            [QrCode, "QR-code check-in", "Patients scan on arrival, or join remotely. Booked and walk-in patients share one list."],
            [UserCheck, "Arrival tracking", "See who has arrived, who's waiting, and who's with a practitioner."],
            [MonitorCheck, "Live reception dashboard", "One list that updates in real time. Call, mark seen, cancel and add walk-ins in a click."],
            [Bell, "Status notifications", "WhatsApp or SMS when it's nearly someone's turn, carrying only name, position and estimate."],
            [Clock, "Honest waiting-time ranges", "Estimates shown as ranges, only when reliable, and always labelled as estimates."],
            [EyeOff, "Privacy-first", "Queue screens and messages never reveal why someone is there."],
          ].map(([I, t, d]) => {
            const Ic = I as typeof QrCode;
            return <div className="x-card" key={t as string}><span className="x-icon"><Ic size={24} aria-hidden="true" /></span><h3 className="x-h3" style={{ marginTop: 18 }}>{t as string}</h3><p>{d as string}</p></div>;
          })}
        </div>
      </Section>

      <Section tone="sky">
        <Head center eyebrow="A day with Flow" title="From the front door to the consulting room." />
        <div className="x-steps">
          {[
            ["Scan", "A QR code at reception or in the confirmation message opens the practice page."],
            ["Check in", "Patients add a name and number, and optionally answer a few structured intake questions."],
            ["Wait anywhere", "They get a live position and an estimate, and a message when they're two away."],
            ["Be seen", "Reception calls them. Their phone updates in the same second."],
          ].map(([t, d]) => <div className="x-step" key={t}><h3 className="x-h3">{t}</h3><p>{d}</p></div>)}
        </div>
      </Section>

      <Section>
        <div className="x-split">
          <div>
            <Head eyebrow="Patient privacy" title="Designed so private things stay private." lead="Waiting rooms are public. Flow is built so that what's on a screen or in a message never says more than it should." />
          </div>
          <ul className="x-list">
            {[
              ["Structured intake only", "No free-text answers collected, so nothing sensitive is typed into a form."],
              ["Minimal messages", "Practice name, position and estimate. Nothing about why."],
              ["Consent for record storage", "Opt-in, withdrawable, and kept separate from the day's queue."],
              ["Role-based access", "Reception sees the queue, clinicians see intake and notes, and each practice sees only its own."],
            ].map(([t, d]) => <li key={t}><Smartphone size={22} aria-hidden="true" /><div><strong>{t}</strong><span>{d}</span></div></li>)}
          </ul>
        </div>
      </Section>

      <Section tone="white">
        <Head center eyebrow="Questions" title="Flow FAQs" />
        <div className="x-narrow x-center"><Faq items={FAQ} /></div>
      </Section>

      <CtaBand title="Bring Flow to your practice." lead="Flow is the first part of BabyBlue we've built. Tell us about your practice and we'll talk about early access." primary={{ href: "/waitlist?role=practice-owner", label: "Join the Waitlist" }} secondary={{ href: "/contact", label: "Talk to us" }} />
    </>
  );
}
