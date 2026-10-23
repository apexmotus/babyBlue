import { Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { Section } from "@/components/site/blocks";
import { LeadForm } from "@/components/site/LeadForm";
import { pageMeta } from "@/lib/meta";
import { SITE } from "@/lib/site";

export const metadata = pageMeta("Contact BabyBlue", "Questions about BabyBlue, partnerships, Growth services, press or privacy requests? Get in touch.", "/contact");

export default function Contact() {
  return (
    <Section>
      <div className="x-split" style={{ alignItems: "start" }}>
        <div className="x-stack" style={{ ["--gap" as string]: "22px" }}>
          <span className="x-eyebrow">Contact</span>
          <h1 className="x-h1" style={{ fontSize: "clamp(2.4rem,5vw,3.8rem)" }}>Let&apos;s talk.</h1>
          <p className="x-lead">Questions, partnerships, Growth services, press or a privacy request: tell us a little and we&apos;ll point you to the right person.</p>
          <ul className="x-list" style={{ marginTop: 28 }}>
            <li><MessageCircle size={22} aria-hidden="true" /><div><strong>Practitioner or practice?</strong><span>Choose &ldquo;Practitioner partnership&rdquo; or &ldquo;Growth services&rdquo; and we&apos;ll follow up.</span></div></li>
            <li><ShieldCheck size={22} aria-hidden="true" /><div><strong>Privacy request?</strong><span>Choose &ldquo;Privacy request (POPIA)&rdquo; to ask about, correct or delete personal information.</span></div></li>
            {SITE.contactEmail && <li><Mail size={22} aria-hidden="true" /><div><strong>Email</strong><span><a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a></span></div></li>}
          </ul>
          <p className="x-small">For urgent health concerns, contact a practitioner or call 10177 (ambulance) or 112 from a mobile phone. BabyBlue can&apos;t give medical advice.</p>
        </div>
        <div className="x-card" style={{ padding: "clamp(24px,4vw,40px)" }}>
          <LeadForm kind="contact" />
        </div>
      </div>
    </Section>
  );
}
