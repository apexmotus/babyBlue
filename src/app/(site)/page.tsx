import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, BadgeCheck, Bell, CalendarCheck, CalendarClock, Camera, Compass, Lock, MapPinned, QrCode, Rocket, Search, ShieldCheck, Wallet, Clock, Layers,
} from "lucide-react";
import { Finder } from "@/components/front/Finder";
import { Reveal } from "@/components/front/Reveal";
import { SpecialityTiles } from "@/components/front/SpecialityTiles";
import { Btn, CtaBand, FeatureList, Head, PhotoSlot, Section } from "@/components/site/blocks";
import { MockCaption, PhoneMock } from "@/components/site/mocks";
import { getCities, getFinderData, getListedSpecialities } from "@/lib/directory-facets";
import { getDirectorySummary } from "@/lib/practices/data";

export const metadata: Metadata = {
  title: { absolute: "BabyBlue — Care, connected. Better access to care." },
  description: "Find and book practitioners on your schedule, with real appointment times. Try the working demo.",
  alternates: { canonical: "/" },
};

export default function Home() {
  const finder = getFinderData();
  const cities = getCities();
  const specialities = getListedSpecialities();
  const directory = getDirectorySummary();
  const num = (x: number) => x.toLocaleString("en-ZA");
  return (
    <>
      {/* 1 · HERO: finder-first. This is the patient site; the practitioner side is not linked from here (D-34). */}
      <section className="f-hero">
        <div className="x-container">
          <div className="f-hero-grid">
            <div className="f-hero-copy">
              <span className="x-chip dev x-rise"><Rocket size={14} aria-hidden="true" /> In development · early access for South Africa</span>
              <h1 className="f-display x-rise d1">Better access to care.<br /><span className="acc">On your schedule.</span></h1>
              <p className="f-lead x-rise d2">Find and book practitioners at times that suit you, with real availability from the practices that offer it.</p>
              <div id="find" className="x-rise d3" style={{ width: "100%" }}>
                <Finder data={finder} />
              </div>
              <div className="f-quick x-rise d4">
                <span>Popular</span>
                {specialities.slice(0, 4).map((s) => (
                  <Link key={s.slug} href={`/${s.slug}`}>{s.plural}</Link>
                ))}
              </div>
              <div className="f-hero-foot x-rise d4">
                <span><CalendarClock size={17} aria-hidden="true" /> Real availability</span>
                <span><BadgeCheck size={17} aria-hidden="true" /> Verified when confirmed</span>
                <span><ShieldCheck size={17} aria-hidden="true" /> Your data stays private</span>
              </div>
              <div className="f-hero-foot x-rise d4">
                <Link href="/patient" className="x-eyebrow">Open the patient app <ArrowRight size={14} aria-hidden="true" /></Link>
              </div>
            </div>

            <div className="x-rise d2">
              <figure className="f-stage" style={{ margin: 0 }} aria-label="Photography placeholder: a South African patient booking an appointment on her phone at home.">
                <figcaption className="f-stage-cap">
                  <b><Camera size={13} aria-hidden="true" /> Photography to be commissioned</b>
                  A South African patient booking an appointment on her phone at home.
                </figcaption>
                <div className="f-chipcard one">
                  <span className="x-icon"><CalendarClock size={20} aria-hidden="true" /></span>
                  <div><b>Real availability</b>Straight from the practitioner&apos;s diary</div>
                </div>
                <div className="f-chipcard two">
                  <span className="x-icon sage"><BadgeCheck size={20} aria-hidden="true" /></span>
                  <div><b>Verified when confirmed</b>Checked against council registers</div>
                </div>
                <PhoneMock />
              </figure>
              <div className="f-stage-note"><MockCaption /></div>
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
          [MapPinned, "Care near you", "Across South Africa"],
          [Layers, "Practice directory", "Browse before you book"],
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

      {/* 4 · HOW IT WORKS */}
      <Section tone="white" id="how">
        <Head center eyebrow="How BabyBlue works" title="From “I need someone” to a confirmed time." lead="A simple way to find a practitioner you can trust and book a time that works for you." />
        <div className="x-journey" style={{ marginBottom: 28, justifyContent: "center" }} aria-label="Patient journey">
          {["Search", "Discover", "Compare", "Select time", "Book", "Confirm", "Attend", "Manage"].map((s, i, a) => (
            <span key={s} style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
              <span className="s">{s}</span>
              {i < a.length - 1 && <ArrowRight size={14} aria-hidden="true" />}
            </span>
          ))}
        </div>
        <ol className="x-list" style={{ counterReset: "n", maxWidth: 720, marginInline: "auto" }}>
          {[
            ["Search and compare", "Filter by speciality, service, location, language and availability."],
            ["Choose a real time", "Only genuinely open slots are shown, and held for you while you book."],
            ["Confirm and attend", "Get a confirmation and reminders, then check in with a QR code."],
            ["Manage with ease", "Reschedule, cancel and rebook from your appointment history."],
          ].map(([t, d], i) => (
            <li key={t}><span className="x-icon round deep" style={{ width: 36, height: 36, fontWeight: 800, fontFamily: "var(--font-head)", fontSize: 14 }}>{i + 1}</span><div><strong>{t}</strong><span>{d}</span></div></li>
          ))}
        </ol>
      </Section>

      {/* 5 · SPECIALITIES AND CITIES: tiles open the public, indexable listing pages */}
      <Section>
        <div className="f-row-head">
          <div className="x-stack" style={{ ["--gap" as string]: "14px" }}>
            <span className="f-kicker">Care for every stage of life</span>
            <h2 className="f-h2">From everyday care to <span className="acc">specialised support.</span></h2>
          </div>
          <p className="f-lead">BabyBlue is built for the whole spectrum of practitioners, from GPs and dentists to therapists, physiotherapists and wellness professionals.</p>
        </div>
        <SpecialityTiles />

        <div className="f-row-head" style={{ marginTop: "clamp(56px, 8vw, 104px)" }}>
          <div className="x-stack" style={{ ["--gap" as string]: "14px" }}>
            <span className="f-kicker">Find care in your city</span>
            <h2 className="f-h2">Start with <span className="acc">where you are.</span></h2>
          </div>
          <p className="f-lead">Each city page lists only practitioners who have opened a diary on BabyBlue, so every time you see can be booked.</p>
        </div>
        <ul className="f-cities">
          {cities.map((c, i) => (
            <Reveal as="li" key={c.slug} delay={i * 70}>
              <Link className="f-city" href={`/in/${c.slug}`}>
                <span>{c.name}<small>See who&apos;s available</small></span>
                <span className="go" aria-hidden="true"><ArrowUpRight size={20} /></span>
              </Link>
            </Reveal>
          ))}
        </ul>
      </Section>

      {/* PRACTICE DIRECTORY: real practices from OpenStreetMap, none of them on BabyBlue yet */}
      {directory.practices > 0 && (
        <Section tone="deep">
          <div className="x-split">
            <div className="x-stack" style={{ ["--gap" as string]: "18px" }}>
              <span className="x-eyebrow">Practice directory</span>
              <h2 className="x-h2">Real practices near you, even before they join BabyBlue.</h2>
              <p className="x-lead">Browse hospitals, clinics, doctors, dentists and other practices across South Africa. The ones that join BabyBlue show real appointment times and take bookings, each marked as coming from BabyBlue.</p>
              <div className="x-btn-row"><Btn href="/directory" variant="light" arrow>Browse the directory</Btn></div>
            </div>
            <div>
              <div className="f-stats">
                <div className="f-stat"><b>{num(directory.practices)}</b><span>practices</span></div>
                <div className="f-stat"><b>{num(directory.provinces)}</b><span>provinces</span></div>
                <div className="f-stat"><b>{num(directory.cities)}</b><span>cities and towns</span></div>
              </div>
              <p className="x-small" style={{ color: "rgba(255,255,255,.65)", marginTop: 14 }}>Details © OpenStreetMap contributors (ODbL), retrieved {directory.retrieved}. Not verified by BabyBlue, and not yet on BabyBlue.</p>
            </div>
          </div>
        </Section>
      )}

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

      {/* 9 · CHECK-IN: the patient side of queue management */}
      <Section>
        <div className="x-split">
          <div>
            <Head eyebrow="Check in" title="Calmer waiting rooms." lead="Check in with a QR code and wait wherever suits you. You'll know what's happening, without sharing private details." />
            <FeatureList
              items={[
                { icon: <QrCode size={20} aria-hidden="true" />, title: "QR-code check-in", text: "Let the practice know you've arrived, booked or walk-in." },
                { icon: <Bell size={20} aria-hidden="true" />, title: "Status notifications", text: "Messages carry the practice name and queue position, never a reason for the visit." },
                { icon: <Clock size={20} aria-hidden="true" />, title: "Honest waiting-time ranges", text: "Shown only when there's enough data to be reliable, and always as an estimate." },
              ]}
            />
          </div>
          <div className="x-card" style={{ padding: 32, background: "linear-gradient(160deg,#fff,#eef7f9)" }}>
            <span className="x-chip sky">Try it now · demonstration data</span>
            <h3 className="x-h3" style={{ marginTop: 14 }}>See a queue from the patient&apos;s side</h3>
            <p>Open the patient screen and join a practice's queue. Every name and figure in the demo is fictional.</p>
            <div className="x-btn-row" style={{ marginTop: 20 }}>
              <Link className="x-btn x-btn-primary x-btn-sm" href="/c/rosebank-family">Open the demo</Link>
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
            [ShieldCheck, "Privacy by design", "Built around POPIA. Your information is kept separate from every other practice's, access is role-based, and health information is never used to target advertising or marketing."],
            [Wallet, "No fabricated proof", "No made-up reviews, ratings or results. Everything you see comes from real practices and real bookings, and you can always see where it comes from."],
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
        lead="Find a practitioner and see when they're free. The working demo uses fictional practices and patients."
        primary={{ href: "/patient", label: "Open the patient app" }}
        secondary={{ href: "/directory", label: "Browse the directory" }}
      />
    </>
  );
}
