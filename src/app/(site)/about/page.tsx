import { Compass, EyeOff, Handshake, HeartPulse, ShieldCheck } from "lucide-react";
import { CtaBand, Head, PageHero, PhotoSlot, Section } from "@/components/site/blocks";
import { pageMeta } from "@/lib/meta";

export const metadata = pageMeta("About BabyBlue — Care, connected.", "BabyBlue connects people with practitioners and helps practitioners grow. Starting in South Africa, expanding across Southern Africa.", "/about");

const VALUES = [
  [HeartPulse, "People first", "Every decision starts with the person trying to get care, and the practitioner trying to provide it."],
  [ShieldCheck, "Earned trust", "We verify before we badge. We measure before we claim. We never fabricate reviews, ratings or results."],
  [EyeOff, "Privacy by design", "Sensitive health information is protected, isolated between practices and never used to target marketing."],
  [Handshake, "Practitioners as partners", "Your clients are yours. We build tools that give you time back, not lock you in."],
  [Compass, "Local first", "Built for how South Africans actually find and use care, with Southern Africa in mind from day one."],
] as const;

export default function About() {
  return (
    <>
      <PageHero
        eyebrow="About BabyBlue"
        title={<>Care, <span className="x-accent">connected.</span></>}
        lead="BabyBlue exists to make care easier to find and practices easier to run. We're starting in South Africa and building for Southern Africa."
        aside={<PhotoSlot shape="rect" brief="A bright South African community practice: reception, waiting area and a friendly welcome." style={{ minHeight: 380 }} />}
      />
      <Section tone="white">
        <div className="x-split">
          <Head eyebrow="Why we're building BabyBlue" title="Access to care shouldn't depend on who you know or how long you wait on hold." />
          <div className="x-stack x-muted" style={{ ["--gap" as string]: "16px", lineHeight: 1.75 }}>
            <p>Finding the right practitioner can mean calls that go unanswered, diaries you can&apos;t see and guesswork about who is qualified. Meanwhile, practitioners who&apos;d rather focus on patients are stretched across admin, bookings and marketing.</p>
            <p>BabyBlue connects both sides: a simple, trustworthy way for people to find and book care, and a practical set of tools for practitioners to be found, run their day and grow, with marketing support available when they want it.</p>
            <p>We&apos;re building it carefully, in the open about what&apos;s ready and what isn&apos;t, because trust in healthcare is earned.</p>
          </div>
        </div>
      </Section>
      <Section>
        <Head eyebrow="What we stand for" title="Principles we build by." />
        <div className="x-grid x-g3">
          {VALUES.map(([I, t, d]) => {
            const Ic = I;
            return <div className="x-card" key={t}><span className="x-icon sage"><Ic size={24} aria-hidden="true" /></span><h3 className="x-h3" style={{ marginTop: 18 }}>{t}</h3><p>{d}</p></div>;
          })}
        </div>
      </Section>
      <Section tone="sky">
        <Head center eyebrow="Where we are" title="Early, honest and moving carefully." lead="BabyBlue is in development. The queue-management module (BabyBlue Flow) is the first working piece, and you can try it today with fictional data. The consumer app, practitioner OS and Growth workspace are being built. We'll never describe something as available before it is." />
      </Section>
      <CtaBand title="Come with us." lead="Whether you're looking for care or providing it, we'd love to hear from you." primary={{ href: "/patient", label: "Open the patient app" }} secondary={{ href: "/contact", label: "Contact us" }} />
    </>
  );
}
