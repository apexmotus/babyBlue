import { Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { Section } from "@/components/site/blocks";
import { LeadForm } from "@/components/site/LeadForm";
import { pageMeta } from "@/lib/meta";
import { SITE } from "@/lib/site";

export const metadata = pageMeta("Talk to BabyBlue about your practice", "Joining BabyBlue, Growth services or a question about the platform? Get in touch.", "/practitioners/contact");

export default function ProContact() {
  return (
    <Section>
      <div className="x-split" style={{ alignItems: "start" }}>
        <div className="x-stack" style={{ ["--gap" as string]: "22px" }}>
          <span className="x-eyebrow">For practices</span>
          <h1 className="x-h1" style={{ fontSize: "clamp(2.4rem,5vw,3.8rem)" }}>Let&apos;s talk.</h1>
          <p className="x-lead">Tell us a little about your practice and what you&apos;d like help with, and we&apos;ll point you to the right person.</p>
          <ul className="x-list" style={{ marginTop: 28 }}>
            <li><MessageCircle size={22} aria-hidden="true" /><div><strong>Joining BabyBlue or Growth services?</strong><span>Choose &ldquo;Joining BabyBlue as a practice&rdquo; or &ldquo;Marketing &amp; Growth services&rdquo; and we&apos;ll follow up.</span></div></li>
            <li><ShieldCheck size={22} aria-hidden="true" /><div><strong>Privacy request?</strong><span>Choose &ldquo;Privacy request (POPIA)&rdquo; to ask about, correct or delete personal information.</span></div></li>
            {SITE.contactEmail && <li><Mail size={22} aria-hidden="true" /><div><strong>Email</strong><span><a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a></span></div></li>}
          </ul>
        </div>
        <div className="x-card" style={{ padding: "clamp(24px,4vw,40px)" }}>
          <LeadForm audience="pro" />
        </div>
      </div>
    </Section>
  );
}
