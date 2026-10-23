import { BadgeCheck, Bell, CalendarClock, CalendarX2, Compass, Filter, History, MapPinned, Search, ShieldCheck } from "lucide-react";
import { Btn, CtaBand, Faq, FeatureList, Head, PageHero, PhotoSlot, Section } from "@/components/site/blocks";
import { MockCaption, PhoneMock } from "@/components/site/mocks";
import { pageMeta } from "@/lib/meta";
import { CATEGORIES } from "@/lib/site";

export const metadata = pageMeta("BabyBlue App — find and book practitioners", "Your next appointment, a few taps away. Search practitioners by speciality, service and location, see real availability and book in minutes. Join the BabyBlue waitlist.", "/app");

const FAQ = [
  ["Is the BabyBlue App available to download?", "Not yet. The app is in development and isn't in any app store. Join the waitlist and we'll tell you as soon as early access opens in your area."],
  ["Does it cost anything to book?", "We plan for searching and booking to be free for patients. Practitioners set their own consultation fees, and we'll show them upfront wherever a practitioner shares them. Pricing details will be confirmed before launch."],
  ["How do I know a practitioner is qualified?", "A verified badge only appears once we've checked registration against the relevant statutory council's public register. If a profile isn't verified, it says so."],
  ["Will you show me real availability?", "Yes. Times come directly from the practitioner's diary, and a slot is held for you while you complete your booking so two people can't take the same time."],
  ["Is my health information shared or used for ads?", "No. We collect only what's needed to make and manage a booking, and health information is never used to target advertising."],
] as const;

export default function AppPage() {
  return (
    <>
      <PageHero
        eyebrow="BabyBlue App"
        title={<>Your next appointment, <span className="x-accent">a few taps away.</span></>}
        lead="Find the right practitioner, see when they're genuinely free, and book in minutes. Care that fits your life, in one clear, calm app."
        actions={<><Btn href="/waitlist?role=patient" arrow>Join the Waitlist</Btn><Btn href="/practitioners" variant="outline">I&apos;m a practitioner</Btn></>}
        aside={
          <div style={{ display: "flex", justifyContent: "center", gap: "4%", alignItems: "center" }}>
            <PhoneMock className="x-float" />
            <PhoneMock screen="confirmed" />
          </div>
        }
      />
      <div className="x-container" style={{ marginTop: -40, marginBottom: 40 }}><p className="x-small x-center" style={{ textAlign: "center" }}>The BabyBlue App is in development and isn&apos;t yet available in app stores.</p><MockCaption>Illustrative screens. Names and times are examples.</MockCaption></div>

      <Section tone="white">
        <Head eyebrow="The journey" title="Search. Discover. Compare. Select a time. Book. Confirm. Attend. Manage." lead="Every step is designed to take as little effort as possible, and to never leave you guessing." />
        <div className="x-steps">
          {[
            ["Search & discover", "Search by speciality, service or place. Browse practitioners near you or wherever you're headed."],
            ["Compare", "See experience, languages, consultation types and fees side by side, and read profiles written by the practitioners themselves."],
            ["Select a time", "Pick from genuinely available slots. We hold your chosen time while you confirm."],
            ["Book & confirm", "Confirm in a few taps and get an instant confirmation with a calendar link."],
            ["Attend", "Get reminders, directions and a QR code for quick check-in on the day."],
            ["Manage", "Reschedule or cancel within the practitioner's policy, and see your full appointment history."],
            ["Rebook", "Book your follow-up with the same practitioner in a tap."],
            ["Travel", "Different city. Same easy way to book. Find care wherever you are."],
          ].map(([t, d]) => (
            <div className="x-step" key={t}><h3 className="x-h3">{t}</h3><p>{d}</p></div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="x-split">
          <div>
            <Head eyebrow="Built for real life" title="Care that fits your life." lead="Whether you're booking for yourself, a parent or a child, working shifts or travelling for work, BabyBlue gets out of your way." />
            <FeatureList
              items={[
                { icon: <Filter size={20} aria-hidden="true" />, title: "Filters that matter", text: "Speciality, service, location, language, availability, consultation type and more." },
                { icon: <BadgeCheck size={20} aria-hidden="true" />, title: "Verified where confirmed", text: "Registration status shown only once it has actually been checked." },
                { icon: <CalendarClock size={20} aria-hidden="true" />, title: "Real availability", text: "No phone tag. No fake slots. What you see is what's open." },
                { icon: <Bell size={20} aria-hidden="true" />, title: "Reminders that help", text: "Gentle reminders by email or SMS, and one-tap rescheduling." },
                { icon: <History size={20} aria-hidden="true" />, title: "Your appointment history", text: "Past and upcoming appointments, all in one place." },
              ]}
            />
          </div>
          <PhotoSlot shape="rect" brief="Everyday South African life: a woman on a sofa confirming an appointment on her phone." className="" style={{ minHeight: 440 }} />
        </div>
      </Section>

      <Section tone="sky">
        <Head eyebrow="Find the right care" title="From everyday care to specialised support." />
        <div className="x-cats">
          {CATEGORIES.map((c) => (
            <div className="x-cat" key={c.slug}><span className="x-icon"><Search size={22} aria-hidden="true" /></span><div><b>{c.name}</b><span>{c.blurb}</span></div></div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="x-grid x-g3">
          {[
            [MapPinned, "Different city. Same easy way to book.", "Moving for work or visiting family? Search a new area and book with the same simple flow."],
            [CalendarX2, "Plans change. That's fine.", "Reschedule or cancel from the app within each practitioner's cancellation policy, which is always shown before you book."],
            [ShieldCheck, "Your privacy, protected", "We collect only what a booking needs, keep it separate between practices, and never use health information for advertising."],
          ].map(([I, t, d]) => {
            const Ic = I as typeof Compass;
            return <div className="x-card" key={t as string}><span className="x-icon sage"><Ic size={24} aria-hidden="true" /></span><h3 className="x-h3" style={{ marginTop: 18 }}>{t as string}</h3><p>{d as string}</p></div>;
          })}
        </div>
      </Section>

      <Section tone="white">
        <Head center eyebrow="Questions" title="Good to know." />
        <div className="x-narrow x-center"><Faq items={FAQ} /></div>
      </Section>

      <CtaBand title="Be first in line when BabyBlue opens." lead="Tell us where you are and what care you're looking for. We'll email you when early access opens near you." primary={{ href: "/waitlist?role=patient", label: "Join the Waitlist" }} secondary={{ href: "/practitioners", label: "For practitioners" }} />
    </>
  );
}
