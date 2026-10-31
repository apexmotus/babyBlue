import { Brain, Building, Building2, Smile, Stethoscope, User } from "lucide-react";
import { CtaBand, Head, PageHero, Section } from "@/components/site/blocks";
import { pageMeta } from "@/lib/meta";
import Link from "next/link";

export const metadata = pageMeta("Solutions — BabyBlue for every kind of practice", "From solo practitioners to multi-site groups, see how BabyBlue App, OS, Growth and Flow fit the way your practice works.", "/solutions");

const SOLUTIONS = [
  { icon: User, title: "Solo practitioners", pain: "You are the practitioner, the receptionist and the marketer.", help: "A diary patients can book into, reminders that reduce no-shows, and marketing help when you want it, without a full-time admin.", modules: ["App", "OS", "Growth"] },
  { icon: Stethoscope, title: "GPs & family practices", pain: "Busy front desks, walk-ins and bookings competing for the same list.", help: "One live list for walk-ins and appointments, QR check-in and clear status for the waiting room.", modules: ["OS", "Flow", "App"] },
  { icon: Smile, title: "Dental practices", pain: "Chairs sit empty when appointments are cancelled late.", help: "Procedure-length slots, easy rescheduling and reminders that get read, so gaps are filled sooner.", modules: ["OS", "App", "Growth"] },
  { icon: Brain, title: "Therapists & mental health", pain: "Privacy matters most, and admin shouldn't intrude on care.", help: "Minimal client records, no health detail in messages, and flexible session lengths, with consent handled properly.", modules: ["OS", "App"] },
  { icon: Building2, title: "Group & multi-practitioner practices", pain: "Many diaries, many people, one brand.", help: "Multiple practitioners, roles and permissions, shared reporting and consistent branding.", modules: ["OS", "Flow", "Growth"] },
  { icon: Building, title: "Multi-site & wellness businesses", pain: "Growth means more locations, and more complexity.", help: "Practice locations in one workspace, with strict separation of data and consolidated insights.", modules: ["OS", "Growth", "Flow"] },
] as const;

export default function Solutions() {
  return (
    <>
      <PageHero
        eyebrow="Solutions"
        title={<>One platform. <span className="x-accent">Whatever your practice looks like.</span></>}
        lead="BabyBlue is modular, so you adopt what helps today and add more as you grow."
      />
      <Section tone="white">
        <div className="x-grid x-g2">
          {SOLUTIONS.map((s) => {
            const Ic = s.icon;
            return (
              <div className="x-card" key={s.title} style={{ padding: 32 }}>
                <span className="x-icon deep"><Ic size={24} aria-hidden="true" /></span>
                <h2 className="x-h3" style={{ marginTop: 18, fontSize: "1.4rem" }}>{s.title}</h2>
                <p style={{ fontStyle: "italic" }}>{s.pain}</p>
                <p style={{ color: "var(--deep)" }}>{s.help}</p>
                <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
                  {s.modules.map((m) => <span key={m} className="x-chip sky">BabyBlue {m}</span>)}
                </div>
              </div>
            );
          })}
        </div>
        <p className="x-small x-center" style={{ marginTop: 28, textAlign: "center" }}>Don&apos;t see your practice type? <Link href="/contact">Talk to us.</Link> BabyBlue is built to support the full range of registered practitioners.</p>
      </Section>
      <CtaBand title="Tell us how your practice works." lead="We're shaping BabyBlue with practices across South Africa. Try the demo and help us get it right." primary={{ href: "/practice/login", label: "Open BabyBlue OS" }} secondary={{ href: "/contact", label: "Contact us" }} />
    </>
  );
}
