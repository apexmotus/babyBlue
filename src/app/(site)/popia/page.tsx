import { Section } from "@/components/site/blocks";
import { pageMeta } from "@/lib/meta";

export const metadata = pageMeta("POPIA position", "A plain-language summary of how BabyBlue approaches the protection of personal information under POPIA. Not legal advice and not a certification.", "/popia");

export default function Popia() {
  return (
    <Section>
      <div className="x-narrow x-prose">
        <span className="x-eyebrow">POPIA position</span>
        <h1 className="x-h1" style={{ fontSize: "clamp(2.2rem,4.5vw,3.4rem)", margin: "16px 0 12px" }}>How BabyBlue handles personal information</h1>
        <div className="x-notice warn" style={{ margin: "20px 0" }}>This is a plain-language summary of our approach. It is not a legal opinion and not a certification. BabyBlue has not been independently audited for POPIA compliance.</div>
        <h2>What we keep</h2>
        <p>The minimum needed to run a booking or a queue: a name, a contact number or email, and appointment details. An ID number is collected only where a practice needs it and the person consents to record storage. Intake answers are structured categories, never free text.</p>
        <h2>Who can see it</h2>
        <p>Only the practice a person books with, through role-based access. Practices are isolated from each other, and platform staff access is limited, logged and purpose-bound.</p>
        <h2>Messages</h2>
        <p>Notifications carry the practice name, appointment time or queue position. They never contain a reason for the visit, an intake answer or a diagnosis.</p>
        <h2>Marketing and health information</h2>
        <p>Health information is never used to target advertising or marketing. BabyBlue Growth campaigns are built around a practitioner&apos;s own public information and approved creative, not patient data.</p>
        <h2>Consent and rights</h2>
        <p>Record storage is opt-in and can be withdrawn. People can ask a practice, or us, to access, correct or delete their personal information. Use the <a href="/contact">contact page</a> and choose &ldquo;Privacy request&rdquo;.</p>
        <h2>Roles</h2>
        <p>In most cases the practice is the responsible party and BabyBlue acts as an operator under a written agreement. Where BabyBlue itself decides why and how information is processed (for example, waitlist sign-ups) we are the responsible party. An Information Officer will be registered before launch.</p>
      </div>
    </Section>
  );
}
