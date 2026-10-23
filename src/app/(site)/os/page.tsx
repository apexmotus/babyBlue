import { CalendarDays, ChartNoAxesCombined, ClipboardCheck, LayoutDashboard, LockKeyhole, Building2, UserRoundCog, UsersRound } from "lucide-react";
import { Btn, CtaBand, Faq, Head, PageHero, Section } from "@/components/site/blocks";
import { LaptopMock, MockCaption } from "@/components/site/mocks";
import { pageMeta } from "@/lib/meta";

export const metadata = pageMeta("BabyBlue OS — practice management for practitioners", "Calendar, appointments, clients, staff and insights in one calm workspace. BabyBlue OS is the practitioner operating system designed around the work you do.", "/os");

const MODULES = [
  [LayoutDashboard, "Dashboard", "Today's appointments, new bookings, booking performance, utilisation and cancellation rates at a glance. Every figure is calculated from your real activity."],
  [CalendarDays, "Calendar", "Daily, weekly and monthly views. Services and durations, appointment buffers, leave and blackout dates, and staff schedules."],
  [ClipboardCheck, "Appointments", "Manage bookings, check clients in, update status, reschedule or cancel, and keep clients informed with simple communication workflows."],
  [UsersRound, "Clients", "Basic contact records, appointment history, administrative notes and consent records. Deliberately light on clinical detail."],
  [Building2, "Staff & practices", "Staff accounts, permissions, multiple practitioners, practice locations and settings, with strict separation between practices."],
  [ChartNoAxesCombined, "Insights", "Booking activity, utilisation, cancellation trends and repeat bookings. Revenue where payment data exists, attribution where it's properly measurable."],
] as const;

const ROLES = [
  ["Practice owner", "Full control of the practice, billing, team and settings."],
  ["Receptionist", "Diary, check-ins and queue, without clinical or financial settings."],
  ["Staff member", "Their own schedule, appointments and clients as allowed."],
  ["Marketing operator", "Only the marketing requests and assets a practice shares, never client records."],
] as const;

const FAQ = [
  ["Is BabyBlue OS clinical record software?", "No. BabyBlue OS manages the business side of a practice: scheduling, clients' contact details, consent and administration. It isn't a clinical records system, and it keeps health detail to a minimum on purpose."],
  ["Are the dashboard numbers real?", "Always. Metrics come from your own bookings and payments. If there isn't enough data for a figure to be meaningful, we say so rather than show a placeholder."],
  ["Can I run several practitioners and locations?", "Yes. Add practitioners, locations and staff with role-based permissions. Each practice's data stays isolated from every other practice."],
  ["Is it available now?", "BabyBlue OS is in development. Join the waitlist to hear about early access."],
] as const;

export default function Os() {
  return (
    <>
      <PageHero
        eyebrow="BabyBlue OS"
        title={<>Your practice, <span className="x-accent">running smoothly.</span></>}
        lead="A practitioner operating system for scheduling, clients, teams and insights, designed around the work you do and nothing you don't."
        actions={<><Btn href="/waitlist?role=practitioner" arrow>Join the Waitlist</Btn><Btn href="/growth" variant="outline">Explore Growth</Btn></>}
        aside={<div><LaptopMock /><MockCaption /></div>}
      />

      <Section tone="white">
        <Head eyebrow="Modules" title="Everything the day needs. Nothing it doesn't." />
        <div>
          {MODULES.map(([I, t, d]) => {
            const Ic = I;
            return (
              <div className="x-rowcard" key={t}>
                <span className="x-icon deep"><Ic size={24} aria-hidden="true" /></span>
                <div><h3 className="x-h3">{t}</h3><p>{d}</p></div>
                <span className="x-tag soon">In development</span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section>
        <div className="x-split">
          <div>
            <Head eyebrow="Teams & access" title="The right access for every person on your team." lead="Seven distinct roles keep information where it belongs. Receptionists don't see financials; marketing partners never see clients." />
          </div>
          <div className="x-grid" style={{ gap: 14 }}>
            {ROLES.map(([t, d]) => (
              <div className="x-card flat" key={t} style={{ padding: 20, display: "flex", gap: 16, alignItems: "flex-start" }}>
                <span className="x-icon sky"><UserRoundCog size={22} aria-hidden="true" /></span>
                <div><h3 className="x-h3" style={{ fontSize: "1.05rem" }}>{t}</h3><p style={{ marginTop: 4 }}>{d}</p></div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section tone="deep">
        <div className="x-split">
          <div className="x-stack" style={{ ["--gap" as string]: "18px" }}>
            <span className="x-eyebrow">Data principles</span>
            <h2 className="x-h2">Real numbers. Private by design.</h2>
            <p className="x-lead">BabyBlue OS never manufactures results, and it never repurposes client information for marketing.</p>
          </div>
          <ul className="x-list">
            {[
              ["Metrics from real activity", "Utilisation, cancellations and repeat bookings come from your actual appointments."],
              ["Practice isolation", "Each practice's data is separated from every other practice at the database level."],
              ["Consent first", "Consent records sit alongside client records, and clients can withdraw them."],
              ["Not for ad targeting", "Client or health information is never used to target advertising."],
            ].map(([t, d]) => (
              <li key={t}><LockKeyhole size={22} color="#bde6ef" aria-hidden="true" /><div><strong style={{ color: "#fff" }}>{t}</strong><span style={{ color: "rgba(255,255,255,.75)" }}>{d}</span></div></li>
            ))}
          </ul>
        </div>
      </Section>

      <Section tone="white">
        <Head center eyebrow="Questions" title="BabyBlue OS FAQs" />
        <div className="x-narrow x-center"><Faq items={FAQ} /></div>
      </Section>

      <CtaBand title="See BabyBlue OS first." lead="Join the waitlist as a practitioner and we'll invite you to early access when it opens in your area." primary={{ href: "/waitlist?role=practitioner", label: "Join the Waitlist" }} secondary={{ href: "/pricing", label: "See pricing approach" }} />
    </>
  );
}
