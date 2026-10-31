import { BarChart3, Camera, ClipboardList, Compass, FileCheck2, Globe, Megaphone, Palette, Search, ShieldCheck, Sparkles, Target } from "lucide-react";
import { Btn, CtaBand, Faq, Head, PageHero, Section } from "@/components/site/blocks";
import { pageMeta } from "@/lib/meta";

export const metadata = pageMeta("BabyBlue Growth — marketing services for practitioners", "You take care of your patients. We'll help you take care of business. Profile optimisation, websites, brand, photography, search visibility and compliant campaigns for practitioners.", "/growth");

const SERVICES = [
  [Sparkles, "Professional profile optimisation", "A clear, accurate, well-presented BabyBlue profile that helps the right people choose you: services, specialities, languages, photography and approachable copy."],
  [Globe, "Practice website design", "A fast, accessible website that reflects your practice and connects directly to your BabyBlue diary."],
  [Palette, "Brand identity & design", "A considered visual identity (logo, colour, typography and templates) that feels like your practice."],
  [Camera, "Photography & content creation", "Authentic photography of you, your team and your space, plus content you can actually use."],
  [Search, "Search visibility", "Make sure people searching for your speciality in your area can find you, with accurate local listings and well-structured pages."],
  [Megaphone, "Compliant advertising campaigns", "Paid campaigns built to your regulator's advertising rules, using your public practice information, never patient data."],
  [Compass, "Marketing strategy", "A practical plan that fits your practice, budget and goals, so effort goes where it matters."],
  [BarChart3, "Campaign reporting", "Plain-language reports showing what was done, what it cost and what happened, based on data we can actually measure."],
] as const;

const FAQ = [
  ["Do I have to buy marketing services to use BabyBlue?", "No. BabyBlue Growth is optional. You can use BabyBlue OS and Flow without it, and add services only when you want them."],
  ["How do I request a service?", "From BabyBlue OS, choose a service, complete a short brief (goals, budget range and any assets), and our Growth team replies with a proposal. Nothing starts until you approve it."],
  ["Do you target ads using patient or health information?", "Never. Campaigns use your practice's public information and general audience settings. We do not use patient lists, appointment data or health conditions to target advertising."],
  ["Will my ads comply with advertising rules for my profession?", "We build to the advertising and ethical rules of the relevant regulator (for example the HPCSA for doctors and dentists) and review creative against them before anything goes live. You approve every piece, and remain responsible for your own regulatory compliance. We offer no legal advice or compliance guarantee."],
  ["How much does it cost?", "Services are quoted per project or on a monthly retainer based on your brief. We will publish indicative ranges once pricing is finalised."],
] as const;

export default function Growth() {
  return (
    <>
      <PageHero
        eyebrow="BabyBlue Growth"
        title={<>You take care of your patients. <span className="x-accent">We&apos;ll help you take care of business.</span></>}
        lead="You're an expert in your practice. You shouldn't have to be an expert in marketing, too. Request professional, compliant marketing services straight from BabyBlue OS."
        actions={<><Btn href="/practice/login" arrow>Open BabyBlue OS</Btn><Btn href="/contact" variant="outline">Talk to the Growth team</Btn></>}
      />

      <Section tone="white">
        <Head eyebrow="Services catalogue" title="Marketing support, without the maze." lead="Eight services, each requested with a simple brief, priced up front, and delivered with your approval at every step." />
        <div>
          {SERVICES.map(([I, t, d]) => {
            const Ic = I;
            return (
              <div className="x-rowcard" key={t}>
                <span className="x-icon sage"><Ic size={24} aria-hidden="true" /></span>
                <div><h3 className="x-h3">{t}</h3><p>{d}</p></div>
                <span className="x-tag">Quote on request</span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section tone="sky">
        <Head center eyebrow="How it works" title="From brief to results, with you in control." />
        <div className="x-steps">
          {[
            [ClipboardList, "Request", "Pick a service in BabyBlue OS and complete a short brief: goals, budget range, timing and any assets you'd like to share."],
            [FileCheck2, "Proposal", "The Growth team replies with a clear scope, timeline and price. Nothing begins until you say yes."],
            [Palette, "Create & approve", "You review drafts and creative in one place, request changes and approve every piece before it's used."],
            [Target, "Deliver & report", "Work goes live, deliverables are stored in your library, and you get plain-language reports with real figures."],
          ].map(([I, t, d]) => {
            const Ic = I as typeof Target;
            return <div className="x-step" key={t as string}><span className="x-icon" style={{ marginBottom: 14 }}><Ic size={22} aria-hidden="true" /></span><h3 className="x-h3">{t as string}</h3><p>{d as string}</p></div>;
          })}
        </div>
      </Section>

      <Section>
        <div className="x-split">
          <div>
            <Head eyebrow="Marketing, done responsibly" title="Compliant by design. Private by default." lead="Healthcare marketing carries more responsibility than most. BabyBlue Growth is built around that." />
            <ul className="x-list">
              {[
                ["Built to professional advertising rules", "Creative is reviewed against the advertising and ethical rules of each practitioner's regulator before it goes live."],
                ["No sensitive-data targeting", "Campaigns never use health information, patient lists or appointment data to target advertising."],
                ["You approve everything", "Nothing is published in your name without your explicit approval."],
                ["Measured honestly", "We report only what can be properly measured and will say so when attribution isn't reliable."],
              ].map(([t, d]) => <li key={t}><ShieldCheck size={22} aria-hidden="true" /><div><strong>{t}</strong><span>{d}</span></div></li>)}
            </ul>
          </div>
          <div className="x-card" style={{ padding: 32 }}>
            <span className="x-chip dev">What&apos;s planned for the Growth workspace</span>
            <ul className="x-list" style={{ marginTop: 18 }}>
              {["Service catalogue and request forms", "Project briefs with budget fields", "Asset uploads", "Creative approvals and statuses", "Campaign updates and reports", "A deliverables library"].map((x) => <li key={x}><FileCheck2 size={20} aria-hidden="true" /><span style={{ color: "var(--deep)", fontWeight: 600 }}>{x}</span></li>)}
            </ul>
            <p className="x-small" style={{ marginTop: 18 }}>These tools are in development inside BabyBlue OS.</p>
          </div>
        </div>
      </Section>

      <Section tone="white">
        <Head center eyebrow="Questions" title="Growth FAQs" />
        <div className="x-narrow x-center"><Faq items={FAQ} /></div>
      </Section>

      <CtaBand title="Let us help you take care of business." lead="Tell us about your practice and we'll be in touch as Growth services open." primary={{ href: "/practice/login", label: "Open BabyBlue OS" }} secondary={{ href: "/contact", label: "Talk to the Growth team" }} />
    </>
  );
}
