import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, BadgeCheck, Bell, CalendarCheck, CalendarClock, Camera, ChartNoAxesCombined, ClipboardList, Compass, Globe, LayoutDashboard, Lock, Megaphone, MapPinned,
  Palette, QrCode, Rocket, Search, ShieldCheck, Smartphone, Sparkles, UsersRound, Wallet, Clock, Stethoscope, SmilePlus, Brain, Activity, Leaf, Eye, HeartHandshake, Layers,
} from "lucide-react";
import { Btn, CtaBand, FeatureList, Head, PhotoSlot, Section } from "@/components/site/blocks";
import { LaptopMock, MockCaption, PhoneMock } from "@/components/site/mocks";
import { CATEGORIES } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "BabyBlue — Care, connected. Better access to care. Stronger practices." },
  description: "Find and book practitioners on your schedule. Grow and manage your practice with tools designed around the work you do. Try the working demo.",
  alternates: { canonical: "/" },
};

const CAT_ICONS = [Stethoscope, SmilePlus, Brain, Activity, Leaf, HeartHandshake, Eye, Sparkles];

export default function Home() {
  return (
    <>
      {/* 1 · HERO */}
      <section className="x-hero">
        <div className="x-blob a" style={{ width: 760, height: 620, left: "-8%", top: 120 }} aria-hidden="true" />
        <div className="x-blob b" style={{ width: 640, height: 560, right: "-10%", top: 160 }} aria-hidden="true" />
        <div className="x-container wide">
          <div className="x-hero-copy">
            <span className="x-chip dev x-rise"><Rocket size={14} aria-hidden="true" /> In development · early access for South Africa</span>
            <h1 className="x-h1 x-rise d1">Better access to care.<br /><span className="x-accent">Stronger practices.</span></h1>
            <p className="x-lead x-rise d2">Find and book practitioners on your schedule. Grow and manage your practice with tools designed around the work you do.</p>
            <div className="x-btn-row x-rise d3" style={{ justifyContent: "center" }}>
              <Btn href="/patient" arrow>Open the patient app</Btn>
              <Btn href="/os" variant="outline">Explore BabyBlue OS</Btn>
            </div>
          </div>

          <div className="x-hero-stage">
            <div className="x-hero-side x-rise d3">
              <PhotoSlot brief="A South African patient booking an appointment on her phone at home." shape="rect" style={{ minHeight: 210 }} />
              <div className="x-card soft" style={{ padding: 22 }}>
                <span className="x-chip sky">For patients</span>
                <h2 className="x-h3" style={{ marginTop: 12 }}>Find and book practitioners, anytime.</h2>
                <ul className="x-list" style={{ marginTop: 14, gap: 10 }}>
                  <li><Search size={18} aria-hidden="true" /><span>Discover practitioners near you</span></li>
                  <li><CalendarClock size={18} aria-hidden="true" /><span>Book a real time slot on your phone</span></li>
                  <li><Bell size={18} aria-hidden="true" /><span>Reminders and easy rescheduling</span></li>
                </ul>
              </div>
            </div>

            <div className="x-hero-devices x-rise d2">
              <LaptopMock />
              <PhoneMock className="x-float" />
              <MockCaption />
            </div>

            <div className="x-hero-side x-rise d4">
              <PhotoSlot brief="A practitioner in a South African practice, reviewing the day on a laptop." shape="rect" style={{ minHeight: 210 }} />
              <div className="x-card soft" style={{ padding: 22 }}>
                <span className="x-chip sage">For practitioners</span>
                <h2 className="x-h3" style={{ marginTop: 12 }}>Get more customers. Run a smarter practice.</h2>
                <ul className="x-list" style={{ marginTop: 14, gap: 10 }}>
                  <li><Megaphone size={18} aria-hidden="true" /><span>Marketing services, built in</span></li>
                  <li><CalendarCheck size={18} aria-hidden="true" /><span>Calendar, clients and practice admin</span></li>
                  <li><ChartNoAxesCombined size={18} aria-hidden="true" /><span>Insights from your own data</span></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST BAR */}
      <div className="x-trustbar" role="list" aria-label="Platform highlights">
        {[
          [CalendarCheck, "Book any time", "Pick a slot, any hour"],
          [Clock, "Real availability", "Straight from the diary"],
          [BadgeCheck, "Verified when confirmed", "Checked against registers"],
          [Layers, "Practice admin", "One place to run it"],
          [Megaphone, "Growth services", "Marketing without the maze"],
          [Lock, "Designed for POPIA", "Privacy by design"],
        ].map(([I, t, s]) => {
          const Ic = I as typeof Lock;
          return (
            <div className="x-trust-i" role="listitem" key={t as string}>
              <span className="x-icon round" style={{ width: 40, height: 40 }}><Ic size={19} aria-hidden="true" /></span>
              <div><b>{t as string}</b><span>{s as string}</span></div>
            </div>
          );
        })}
      </div>

      {/* 2 · CONSUMER BENEFITS */}
      <Section>
        <div className="x-persona people">
          <div className="x-stack" style={{ ["--gap" as string]: "18px" }}>
            <span className="x-eyebrow">For people</span>
            <h2 className="x-h2">Care that fits your life.</h2>
            <p className="x-lead">Your next appointment, a few taps away. Search by speciality, service or place, compare practitioners, and choose a time that works around your day, not the other way round.</p>
            <div className="x-btn-row"><Btn href="/app" arrow>Explore the BabyBlue App</Btn></div>
          </div>
          <PhotoSlot shape="rect" style={{ minHeight: 300 }} brief="Everyday South African lifestyle: someone checking their next appointment between errands." />
        </div>

        <div className="x-grid x-g3" style={{ marginTop: 20 }}>
          {[
            [Search, "Find the right fit", "Search by speciality, service or location, then compare experience, languages, fees and availability side by side."],
            [CalendarClock, "Book in a few taps", "See genuinely open times and confirm instantly. No phone tag, no waiting on hold."],
            [Compass, "Different city. Same easy way to book.", "Travelling or relocating? Find care across South Africa with the same simple experience, and soon across Southern Africa."],
          ].map(([I, t, d]) => {
            const Ic = I as typeof Search;
            return (
              <div className="x-card" key={t as string}>
                <span className="x-icon"><Ic size={24} aria-hidden="true" /></span>
                <h3 className="x-h3" style={{ marginTop: 18 }}>{t as string}</h3>
                <p>{d as string}</p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* 3 · PRACTITIONER BENEFITS */}
      <Section tone="sky">
        <div className="x-persona pros" style={{ background: "linear-gradient(135deg,#f1f8f4,#dff0e6)" }}>
          <div className="x-stack" style={{ ["--gap" as string]: "18px" }}>
            <span className="x-eyebrow">For practitioners</span>
            <h2 className="x-h2">More time for your practice. More room to grow.</h2>
            <p className="x-lead">Appointments, clients, queues and marketing in one connected platform, so less of your week goes on admin and more goes on the people you treat.</p>
            <div className="x-btn-row"><Btn href="/practitioners" arrow>See how it works</Btn><Btn href="/growth" variant="outline">Marketing &amp; Growth</Btn></div>
          </div>
          <PhotoSlot shape="rect" style={{ minHeight: 300 }} brief="A South African practitioner between consultations, relaxed and in control of their day." />
        </div>
        <div className="x-grid x-g4" style={{ marginTop: 20 }}>
          {[
            [LayoutDashboard, "BabyBlue OS", "Calendar, appointments, clients, staff and insights in one calm workspace.", "/os"],
            [Megaphone, "BabyBlue Growth", "Professional marketing services you can request without leaving the platform.", "/growth"],
            [QrCode, "BabyBlue Flow", "QR check-in and a live queue for the front desk and the waiting room.", "/flow"],
            [Smartphone, "BabyBlue App", "A booking experience that brings new customers to your diary.", "/app"],
          ].map(([I, t, d, h]) => {
            const Ic = I as typeof Search;
            return (
              <Link href={h as string} className="x-card" key={t as string}>
                <span className="x-icon deep"><Ic size={24} aria-hidden="true" /></span>
                <h3 className="x-h3" style={{ marginTop: 18 }}>{t as string}</h3>
                <p>{d as string}</p>
                <span className="x-eyebrow" style={{ marginTop: 16, fontSize: 11 }}>Learn more <ArrowRight size={14} aria-hidden="true" /></span>
              </Link>
            );
          })}
        </div>
      </Section>

      {/* 4 · HOW IT WORKS */}
      <Section tone="white" id="how">
        <Head center eyebrow="How BabyBlue works" title="One connected platform. Two sides of the same appointment." lead="Patients get a simple way to book. Practitioners get the tools to run and grow the practice behind it." />
        <div className="x-grid x-g2" style={{ gap: 40 }}>
          <div>
            <h3 className="x-h3" style={{ marginBottom: 18, display: "flex", gap: 10, alignItems: "center" }}><span className="x-icon round sky" style={{ width: 40, height: 40 }}><Smartphone size={18} aria-hidden="true" /></span> For patients</h3>
            <div className="x-journey" style={{ marginBottom: 22 }} aria-label="Patient journey">
              {["Search", "Discover", "Compare", "Select time", "Book", "Confirm", "Attend", "Manage"].map((s, i, a) => (
                <span key={s} style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                  <span className="s">{s}</span>
                  {i < a.length - 1 && <ArrowRight size={14} aria-hidden="true" />}
                </span>
              ))}
            </div>
            <ol className="x-list" style={{ counterReset: "n" }}>
              {[
                ["Search and compare", "Filter by speciality, service, location, language and availability."],
                ["Choose a real time", "Only genuinely open slots are shown, and held for you while you book."],
                ["Confirm and attend", "Get a confirmation and reminders, then check in with a QR code."],
                ["Manage with ease", "Reschedule, cancel and rebook from your appointment history."],
              ].map(([t, d], i) => (
                <li key={t}><span className="x-icon round deep" style={{ width: 36, height: 36, fontWeight: 800, fontFamily: "var(--font-head)", fontSize: 14 }}>{i + 1}</span><div><strong>{t}</strong><span>{d}</span></div></li>
              ))}
            </ol>
          </div>
          <div>
            <h3 className="x-h3" style={{ marginBottom: 18, display: "flex", gap: 10, alignItems: "center" }}><span className="x-icon round sage" style={{ width: 40, height: 40 }}><LayoutDashboard size={18} aria-hidden="true" /></span> For practitioners</h3>
            <div className="x-journey" style={{ marginBottom: 22 }} aria-label="Practitioner journey">
              {["Set up", "Get verified", "Open your diary", "Get booked", "Run the day", "Grow"].map((s, i, a) => (
                <span key={s} style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                  <span className="s">{s}</span>
                  {i < a.length - 1 && <ArrowRight size={14} aria-hidden="true" />}
                </span>
              ))}
            </div>
            <ol className="x-list">
              {[
                ["Create your practice", "Add your services, durations, locations and team in minutes."],
                ["Be verified", "We check registration against the relevant council's public register before a verified badge appears."],
                ["Open your diary", "Set availability, buffers and leave. Patients book only what you offer."],
                ["Run and grow", "Manage the day, review insights, and request marketing support when you want it."],
              ].map(([t, d], i) => (
                <li key={t}><span className="x-icon round deep" style={{ width: 36, height: 36, fontWeight: 800, fontFamily: "var(--font-head)", fontSize: 14 }}>{i + 1}</span><div><strong>{t}</strong><span>{d}</span></div></li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      {/* 5 · CATEGORIES */}
      <Section>
        <Head eyebrow="Care for every stage of life" title="From everyday care to specialised support." lead="BabyBlue is built for the whole spectrum of practitioners, from GPs and dentists to therapists, physiotherapists and wellness professionals." />
        <div className="x-cats">
          {CATEGORIES.map((c, i) => {
            const Ic = CAT_ICONS[i];
            return (
              <div className="x-cat" key={c.slug}>
                <span className="x-icon"><Ic size={24} aria-hidden="true" /></span>
                <div><b>{c.name}</b><span>{c.blurb}</span></div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* 6 · APP DEMO */}
      <Section tone="sky" id="app-demo">
        <div className="x-split">
          <div>
            <Head eyebrow="BabyBlue App" title="Your next appointment, a few taps away." lead="Search, compare and book with a clarity you'd expect from the best consumer apps, built for how South Africans actually look for care." />
            <FeatureList
              items={[
                { icon: <Search size={20} aria-hidden="true" />, title: "Discovery that makes sense", text: "Search by speciality, service or location, with filters that matter." },
                { icon: <BadgeCheck size={20} aria-hidden="true" />, title: "Profiles you can trust", text: "Qualifications and registration shown only once they have been verified." },
                { icon: <CalendarClock size={20} aria-hidden="true" />, title: "Real availability", text: "Times come straight from the practitioner's diary, protected against double bookings." },
                { icon: <MapPinned size={20} aria-hidden="true" />, title: "Different city. Same easy way to book.", text: "Find care wherever you are in South Africa." },
              ]}
            />
            <div className="x-btn-row" style={{ marginTop: 28 }}>
              <Btn href="/app" arrow>Explore the App</Btn>
              <Btn href="/patient" variant="outline">Open the patient demo</Btn>
            </div>
            <p className="x-small" style={{ marginTop: 14 }}>The demo runs in your browser with fictional practices. The BabyBlue App is not yet available in app stores.</p>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: "4%", alignItems: "center" }}>
            <PhoneMock className="x-float" />
            <PhoneMock screen="confirmed" className="" />
          </div>
        </div>
        <MockCaption />
      </Section>

      {/* 7 · OS DEMO */}
      <Section>
        <div className="x-split rev">
          <div><LaptopMock /><MockCaption /></div>
          <div>
            <Head eyebrow="BabyBlue OS" title="Your practice, running smoothly." lead="A practitioner operating system designed around the work you do: scheduling, clients, team and insights, without the clutter." />
            <FeatureList
              items={[
                { icon: <CalendarCheck size={20} aria-hidden="true" />, title: "Calendar & availability", text: "Services, durations, buffers, leave and staff schedules in one view." },
                { icon: <ClipboardList size={20} aria-hidden="true" />, title: "Appointments & clients", text: "Check-ins, status updates, rescheduling and simple client records with consent." },
                { icon: <UsersRound size={20} aria-hidden="true" />, title: "Teams & locations", text: "Multiple practitioners, roles and permissions, kept separate between practices." },
                { icon: <ChartNoAxesCombined size={20} aria-hidden="true" />, title: "Insights you can believe", text: "Metrics calculated from your real bookings. Never invented, never inflated." },
              ]}
            />
            <div className="x-btn-row" style={{ marginTop: 28 }}><Btn href="/os" arrow>Explore BabyBlue OS</Btn></div>
          </div>
        </div>
      </Section>

      {/* 8 · GROWTH */}
      <Section tone="deep">
        <div className="x-split">
          <div className="x-stack" style={{ ["--gap" as string]: "20px" }}>
            <span className="x-eyebrow">BabyBlue Growth</span>
            <h2 className="x-h2">You&apos;re an expert in your practice. You shouldn&apos;t have to be an expert in marketing, too.</h2>
            <p className="x-lead">You take care of your patients. We&apos;ll help you take care of business: professional profiles, websites, photography, search visibility and compliant campaigns, requested straight from BabyBlue OS.</p>
            <div className="x-btn-row"><Btn href="/growth" variant="light" arrow>Explore Growth services</Btn></div>
          </div>
          <div className="x-grid x-g2" style={{ gap: 14 }}>
            {[
              [Sparkles, "Profile optimisation"],
              [Globe, "Practice websites"],
              [Palette, "Brand identity"],
              [Camera, "Photography & content"],
              [Search, "Search visibility"],
              [Megaphone, "Compliant campaigns"],
              [Compass, "Marketing strategy"],
              [ChartNoAxesCombined, "Campaign reporting"],
            ].map(([I, t]) => {
              const Ic = I as typeof Search;
              return (
                <div key={t as string} style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.16)", borderRadius: 20, padding: 18, display: "flex", gap: 12, alignItems: "center", fontWeight: 600 }}>
                  <Ic size={20} color="#bde6ef" aria-hidden="true" /> {t as string}
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* 9 · FLOW */}
      <Section>
        <div className="x-split">
          <div>
            <Head eyebrow="BabyBlue Flow" title="Calmer waiting rooms. Clearer front desks." lead="Patients check in with a QR code and can wait wherever suits them. Reception sees one live list. Everyone knows what's happening, without sharing private details." />
            <FeatureList
              items={[
                { icon: <QrCode size={20} aria-hidden="true" />, title: "QR-code check-in", text: "Arrival tracking for booked and walk-in patients." },
                { icon: <Bell size={20} aria-hidden="true" />, title: "Status notifications", text: "Messages carry the practice name and queue position, never a reason for the visit." },
                { icon: <Clock size={20} aria-hidden="true" />, title: "Honest waiting-time ranges", text: "Shown only when there's enough data to be reliable, and always as an estimate." },
              ]}
            />
            <div className="x-btn-row" style={{ marginTop: 28 }}><Btn href="/flow" arrow>Explore BabyBlue Flow</Btn></div>
          </div>
          <div className="x-card" style={{ padding: 32, background: "linear-gradient(160deg,#fff,#eef7f9)" }}>
            <span className="x-chip sky">Try it now · demonstration data</span>
            <h3 className="x-h3" style={{ marginTop: 14 }}>See Flow working end to end</h3>
            <p>Open the staff queue in one tab and a patient&apos;s phone in another. Press <b>Call next</b> and watch the patient screen change. Every name and figure in the demo is fictional.</p>
            <div className="x-btn-row" style={{ marginTop: 20 }}>
              <Link className="x-btn x-btn-primary x-btn-sm" href="/staff/login">Open reception demo</Link>
              <Link className="x-btn x-btn-outline x-btn-sm" href="/c/rosebank-family">Open patient demo</Link>
            </div>
          </div>
        </div>
      </Section>

      {/* 10 · TRUST */}
      <Section tone="white">
        <Head center eyebrow="Trust, security & verification" title="Trust is earned, never assumed." lead="BabyBlue is designed so that you can see what's been verified, and so that sensitive information stays where it belongs." />
        <div className="x-grid x-g3">
          {[
            [BadgeCheck, "Verification you can see", "A verified badge appears only after registration has been checked against the relevant statutory council's public register. Until then, a profile says it hasn't been verified."],
            [ShieldCheck, "Privacy by design", "Built around POPIA. Practices are isolated from each other, access is role-based, and health information is never used to target advertising or marketing."],
            [Wallet, "No fabricated proof", "No made-up reviews, ratings or results. Insights are calculated from real bookings, and you'll always see where a number comes from."],
          ].map(([I, t, d]) => {
            const Ic = I as typeof Lock;
            return (
              <div className="x-card" key={t as string}>
                <span className="x-icon sage"><Ic size={24} aria-hidden="true" /></span>
                <h3 className="x-h3" style={{ marginTop: 18 }}>{t as string}</h3>
                <p>{d as string}</p>
              </div>
            );
          })}
        </div>
        <p className="x-small x-center" style={{ marginTop: 28, maxWidth: 680 }}>
          BabyBlue has not been independently certified for legal or clinical compliance. We describe our approach in plain language on the <Link href="/popia">POPIA page</Link> and will publish certifications only once they are independently verified.
        </p>
      </Section>

      {/* 11 · CTA */}
      <CtaBand
        title="Care, connected."
        lead="Looking for care or providing it? Open the working demo for your side. Every practice and patient in it is fictional."
        primary={{ href: "/patient", label: "Open the patient app" }}
        secondary={{ href: "/practice/login", label: "Open BabyBlue OS" }}
      />
    </>
  );
}
