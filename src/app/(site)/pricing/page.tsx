import { Check, Info } from "lucide-react";
import { Btn, CtaBand, Faq, Head, PageHero, Section } from "@/components/site/blocks";
import { pageMeta } from "@/lib/meta";

export const metadata = pageMeta("Pricing — BabyBlue", "How BabyBlue pricing will work: free for patients, simple plans for practices, and quoted marketing services. Final prices are being confirmed with early practices.", "/pricing");

const PLANS = [
  { name: "Patients", tag: "BabyBlue App", price: "Planned: free", blurb: "Search, compare, book and manage appointments.", items: ["Practitioner search and filters", "Real-time availability", "Reminders and rescheduling", "Appointment history"], cta: ["/patient", "Open the patient app"] },
  { name: "Practice", tag: "BabyBlue OS · Flow", price: "Price to be announced", blurb: "Everything a practice needs to run the day.", items: ["Calendar, services and availability", "Appointments, clients and consent records", "Staff accounts and permissions", "Insights from your real data", "Flow queue and QR check-in"], cta: ["/practice/login", "Open BabyBlue OS"], hot: true },
  { name: "Group & multi-site", tag: "Multiple practitioners and locations", price: "Custom pricing", blurb: "For larger teams and multi-location practices.", items: ["Everything in Practice", "Multiple practitioners and locations", "Role-based access at scale", "Consolidated insights", "Priority onboarding"], cta: ["/contact", "Talk to us"] },
] as const;

const FAQ = [
  ["Are these final prices?", "No. We haven't published prices yet because we want to set them with early practices rather than guess. This page shows the planned structure, and we'll update it before launch."],
  ["Will patients ever be charged by BabyBlue?", "Our plan is for searching and booking to be free for patients. Any consultation fees are set by practitioners and shown before booking wherever they're shared."],
  ["How do Growth services work financially?", "Services are quoted per project or monthly, based on your brief, and nothing starts until you approve the proposal."],
  ["Is there a free trial?", "We'll confirm trial terms for early-access practices when they're finalised."],
] as const;

export default function Pricing() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title={<>Simple, honest pricing. <span className="x-accent">Coming soon.</span></>}
        lead="We'd rather set prices with the practices who'll use BabyBlue than guess. Here's how it will be structured."
      />
      <Section tone="white">
        <div className="x-notice info" style={{ marginBottom: 32 }}>
          <Info size={20} aria-hidden="true" />
          <div><strong>No prices are published yet.</strong> Figures like &ldquo;free&rdquo; describe our plan, not a commitment. Nothing is charged in the demo.</div>
        </div>
        <div className="x-grid x-g3">
          {PLANS.map((p) => (
            <div key={p.name} className={`x-plan ${"hot" in p && p.hot ? "hot" : ""}`}>
              <span className="x-chip sky" style={{ alignSelf: "flex-start" }}>{p.tag}</span>
              <h2 className="x-h3" style={{ fontSize: "1.5rem" }}>{p.name}</h2>
              <div className="price">{p.price}</div>
              <p className="x-muted">{p.blurb}</p>
              <ul>{p.items.map((i) => <li key={i}><Check size={18} aria-hidden="true" />{i}</li>)}</ul>
              <div style={{ marginTop: "auto" }}><Btn href={p.cta[0]} variant={"hot" in p && p.hot ? "primary" : "outline"} arrow>{p.cta[1]}</Btn></div>
            </div>
          ))}
        </div>
        <div className="x-card" style={{ marginTop: 28, padding: 32 }}>
          <h2 className="x-h3" style={{ fontSize: "1.4rem" }}>BabyBlue Growth: quoted to your brief</h2>
          <p>Profile optimisation, websites, brand, photography, search visibility, compliant campaigns, strategy and reporting are scoped and priced per project or on a monthly retainer. You see the proposal first and approve it before any work begins.</p>
          <div style={{ marginTop: 18 }}><Btn href="/growth" variant="outline" arrow>See Growth services</Btn></div>
        </div>
      </Section>
      <Section>
        <Head center eyebrow="Questions" title="Pricing FAQs" />
        <div className="x-narrow x-center"><Faq items={FAQ} /></div>
      </Section>
      <CtaBand title="Help us get pricing right." lead="Try the demo, then tell us what would make BabyBlue worth it for your practice." primary={{ href: "/practice/login", label: "Open BabyBlue OS" }} secondary={{ href: "/contact", label: "Contact us" }} />
    </>
  );
}
