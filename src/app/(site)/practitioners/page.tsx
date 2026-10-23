import { BadgeCheck, CalendarCheck, ChartNoAxesCombined, Handshake, LayoutDashboard, Megaphone, QrCode, ShieldCheck, Smartphone, UsersRound } from "lucide-react";
import { Btn, CtaBand, Faq, Head, PageHero, PhotoSlot, Section } from "@/components/site/blocks";
import { LaptopMock, MockCaption } from "@/components/site/mocks";
import { pageMeta } from "@/lib/meta";
import Link from "next/link";

export const metadata = pageMeta("For practitioners — BabyBlue", "More time for your practice. More room to grow. Get discovered, manage your diary and team, and access marketing services in one connected platform.", "/practitioners");

const FAQ = [
  ["Who is BabyBlue for?", "Independent practitioners, group practices and multi-site businesses: GPs, dentists, psychologists and therapists, physiotherapists, dietitians, optometrists, specialists and wellness professionals."],
  ["Do I have to use every part of BabyBlue?", "No. BabyBlue OS, Flow and Growth are modular. Start with the diary and add queue management or marketing support when it makes sense for your practice."],
  ["How does verification work?", "You provide your registration details. We check them against the relevant statutory council's public register before a verified badge is shown on your profile. Until then, your profile says it hasn't been verified."],
  ["Who owns my client data?", "You do. Each practice's data is isolated from every other practice, access is role-based, and client health information is never used to target marketing."],
  ["What will it cost?", "Pricing is still being finalised with early practices. See the pricing page for the planned structure. Nothing is charged during the waitlist."],
] as const;

export default function Practitioners() {
  return (
    <>
      <PageHero
        eyebrow="For practitioners"
        title={<>More time for your practice. <span className="x-accent">More room to grow.</span></>}
        lead="Be found by the people looking for your kind of care, run your diary, team and queue from one place, and get professional marketing support, without becoming a marketer."
        actions={<><Btn href="/waitlist?role=practitioner" arrow>Join the Waitlist</Btn><Btn href="/os" variant="outline">Explore BabyBlue OS</Btn></>}
        aside={<PhotoSlot shape="rect" brief="A South African practitioner relaxed at their desk, a patient-friendly practice behind them." style={{ minHeight: 420 }} />}
      />

      <Section tone="white">
        <Head eyebrow="One connected platform" title="Everything behind the appointment." lead="Four modules that work together, so the work that fills your diary, runs your day and grows your practice sits in one place." />
        <div className="x-grid x-g2">
          {[
            [Smartphone, "BabyBlue App", "Be discovered by people searching for your speciality, services and location, and let them book the times you choose to offer.", "/app"],
            [LayoutDashboard, "BabyBlue OS", "Calendar, appointments, clients, staff, practices and insights. Everything you need to run the day.", "/os"],
            [Megaphone, "BabyBlue Growth", "Request professional profile optimisation, websites, photography, search visibility and compliant campaigns.", "/growth"],
            [QrCode, "BabyBlue Flow", "QR check-in and a live queue that keeps the waiting room calm and the front desk in control.", "/flow"],
          ].map(([I, t, d, h]) => {
            const Ic = I as typeof Megaphone;
            return (
              <Link href={h as string} className="x-card" key={t as string} style={{ display: "flex", gap: 20 }}>
                <span className="x-icon deep"><Ic size={24} aria-hidden="true" /></span>
                <div><h3 className="x-h3">{t as string}</h3><p>{d as string}</p></div>
              </Link>
            );
          })}
        </div>
      </Section>

      <Section>
        <div className="x-split rev">
          <div><LaptopMock /><MockCaption /></div>
          <div>
            <Head eyebrow="Run it your way" title="Built around the work you actually do." lead="Whether you work solo or lead a team across several locations, BabyBlue adapts to how your practice runs, not the other way round." />
            <ul className="x-list">
              {[
                [CalendarCheck, "Control your diary", "Set services, durations, buffers, leave and blackout dates. Patients can only book what you offer."],
                [UsersRound, "Manage your team", "Staff accounts, permissions, multiple practitioners and locations, with clean separation between practices."],
                [ChartNoAxesCombined, "See what's working", "Booking activity, utilisation and cancellation trends, calculated from your real data."],
                [ShieldCheck, "Protect your clients", "Consent records, role-based access and privacy designed around POPIA."],
              ].map(([I, t, d]) => {
                const Ic = I as typeof Megaphone;
                return <li key={t as string}><Ic size={22} aria-hidden="true" /><div><strong>{t as string}</strong><span>{d as string}</span></div></li>;
              })}
            </ul>
          </div>
        </div>
      </Section>

      <Section tone="sky">
        <Head center eyebrow="Getting started" title="From sign-up to a full diary." />
        <div className="x-steps">
          {[
            ["Join the waitlist", "Tell us about your practice. We'll reach out as early access opens in your area."],
            ["Set up your practice", "Add your services, availability, team and location. We'll help you get it right."],
            ["Get verified", "Share your registration details. We check them before showing a verified badge."],
            ["Open your diary", "Go live to patients, and add Flow or Growth whenever you're ready."],
          ].map(([t, d]) => <div className="x-step" key={t}><h3 className="x-h3">{t}</h3><p>{d}</p></div>)}
        </div>
      </Section>

      <Section>
        <div className="x-split">
          <div>
            <Head eyebrow="Why BabyBlue" title="Grow without giving up your focus." lead="You're an expert in your practice. BabyBlue handles the booking, the admin and the marketing groundwork, so you can stay with your patients." />
            <ul className="x-list">
              {[
                [Handshake, "Partnership, not lock-in", "Your clients are yours. Export your data whenever you need it."],
                [BadgeCheck, "Honest by design", "No fake reviews, no inflated numbers. Trust built on what's real."],
              ].map(([I, t, d]) => {
                const Ic = I as typeof Megaphone;
                return <li key={t as string}><Ic size={22} aria-hidden="true" /><div><strong>{t as string}</strong><span>{d as string}</span></div></li>;
              })}
            </ul>
          </div>
          <div className="x-card" style={{ padding: 32 }}>
            <h3 className="x-h3">Compliance is on us to support and on you to own.</h3>
            <p>Healthcare marketing and records are regulated. BabyBlue builds with those rules in mind and will never target advertising using sensitive health information. Each practitioner remains responsible for meeting their own regulator&apos;s requirements, and BabyBlue has not been independently certified for legal or clinical compliance.</p>
            <div style={{ marginTop: 20 }}><Link href="/popia" className="x-btn x-btn-outline x-btn-sm">Our POPIA position</Link></div>
          </div>
        </div>
      </Section>

      <Section tone="white">
        <Head center eyebrow="Questions" title="Practitioner FAQs" />
        <div className="x-narrow x-center"><Faq items={FAQ} /></div>
      </Section>

      <CtaBand title="Ready for more time and more room to grow?" lead="Join the waitlist for early access to BabyBlue OS, Flow and Growth." primary={{ href: "/waitlist?role=practitioner", label: "Join the Waitlist" }} secondary={{ href: "/contact", label: "Talk to us" }} />
    </>
  );
}
