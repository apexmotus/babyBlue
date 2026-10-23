import { BadgeCheck, Bell, Lock } from "lucide-react";
import { Section } from "@/components/site/blocks";
import { LeadForm } from "@/components/site/LeadForm";
import { pageMeta } from "@/lib/meta";

export const metadata = pageMeta("Join the BabyBlue waitlist", "Be first to hear when BabyBlue opens in your area. Tell us whether you're looking for care or providing it.", "/waitlist");

const ROLES = ["patient", "practitioner", "practice-owner", "practice-manager", "marketing-partner", "other"];

export default async function Waitlist({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  const defaultRole = role && ROLES.includes(role) ? role : undefined;
  return (
    <Section>
      <div className="x-split" style={{ alignItems: "start" }}>
        <div className="x-stack" style={{ ["--gap" as string]: "22px" }}>
          <span className="x-eyebrow">Waitlist</span>
          <h1 className="x-h1" style={{ fontSize: "clamp(2.4rem,5vw,3.8rem)" }}>Be first in line.</h1>
          <p className="x-lead">BabyBlue is in development. Tell us a little about yourself and we&apos;ll email you when early access opens in your area, and tailor what we send you.</p>
          <ul className="x-list" style={{ marginTop: 28 }}>
            <li><Bell size={22} aria-hidden="true" /><div><strong>Only what matters</strong><span>A launch note and early-access invitation. No spam.</span></div></li>
            <li><Lock size={22} aria-hidden="true" /><div><strong>Your details stay with us</strong><span>We never sell your information or use it for advertising targeting.</span></div></li>
            <li><BadgeCheck size={22} aria-hidden="true" /><div><strong>Practitioners get priority conversations</strong><span>We&apos;re shaping BabyBlue with early practices.</span></div></li>
          </ul>
        </div>
        <div className="x-card" style={{ padding: "clamp(24px,4vw,40px)" }}>
          <LeadForm kind="waitlist" defaultRole={defaultRole} />
        </div>
      </div>
    </Section>
  );
}
