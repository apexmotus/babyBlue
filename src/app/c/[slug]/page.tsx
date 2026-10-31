"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, CalendarClock, Clock, Info, MapPin, Phone } from "lucide-react";
import { Field, Logo, Modal, useToast } from "@/components/ui";
import { DEMO_VISIT_ID, OTHER_CLINICS } from "@/lib/seed";
import { closesAt, estimateFor, isOpenNow, useDB, visitById, waitingList } from "@/lib/store";
import { DAYS, validPhone } from "@/lib/util";

export default function ClinicPage() {
  const { slug } = useParams<{ slug: string }>();
  const db = useDB();
  const s = db.settings;
  const [booking, setBooking] = useState(false);

  const other = OTHER_CLINICS.find((c) => c.slug === slug);
  if (slug !== s.slug && !other) {
    return (
      <Shell>
        <div className="card r16" style={{ padding: 24, textAlign: "center" }}>
          <p className="b6 t16">We can&apos;t find that clinic</p>
          <p className="muted" style={{ marginTop: 6 }}>The link or QR code may be out of date.</p>
          <Link href="/find" className="btn btn-primary" style={{ marginTop: 16 }}>Find a clinic</Link>
        </div>
      </Shell>
    );
  }

  if (other) {
    return (
      <Shell>
        <div>
          <h1 style={{ fontSize: 22, letterSpacing: -0.4 }}>{other.name}</h1>
          <p className="muted t13" style={{ marginTop: 4 }}>{other.type} · {other.distance}</p>
        </div>
        <div className={`banner ${other.open ? "good" : "neutral"}`}>
          <Clock size={16} />
          <div>{other.open ? "Open now" : "opens" in other ? other.opens : "Closed"}</div>
        </div>
        {other.mode === "booking" ? (
          <button className="btn btn-primary lg" onClick={() => setBooking(true)}>Request a booking</button>
        ) : (
          <button className="btn btn-primary lg disabled" disabled>Queue opens when the clinic does</button>
        )}
        <div className="banner info">
          <Info size={16} />
          <div>Demo: this practice isn&apos;t wired up. The live queue is at Rosebank Family Practice.</div>
        </div>
        <Link href={`/c/${s.slug}`} className="btn btn-secondary">Go to Rosebank Family Practice</Link>
        {booking && <BookingRequest name={other.name} onClose={() => setBooking(false)} />}
      </Shell>
    );
  }

  const waiting = waitingList(db).length;
  const open = isOpenNow(db);
  const demoVisit = visitById(db, DEMO_VISIT_ID);
  const myVisitActive = demoVisit && demoVisit.status !== "done" && demoVisit.status !== "cancelled";
  const hoursText = (i: number) => (s.hours[i].closed ? "Closed" : `${s.hours[i].open}–${s.hours[i].close}`);
  const hours = [
    ["Mon–Thu", `${s.hours[0].open}–${s.hours[0].close}`],
    ["Fri", hoursText(4)],
    ["Sat", hoursText(5)],
    ["Sun", s.hours[6].closed ? "Closed" : hoursText(6)],
  ];
  return (
    <Shell>
      <div>
        <h1 style={{ fontSize: 24, letterSpacing: -0.5 }}>{s.name}</h1>
        <p className="muted t13" style={{ marginTop: 4 }}>{s.doctors.filter((d) => d.startsWith("Dr")).join(" · ")}</p>
      </div>
      <div className={`banner ${open ? "good" : "warn"}`}>
        <span className={`live-dot ${open ? "" : "off"}`} style={{ marginTop: 6 }} />
        <div>{open ? `Open now — closes ${closesAt(db)}` : "Closed right now — the queue opens with the practice"}</div>
      </div>
      <div className="card r16" style={{ padding: 22 }}>
        <div className="flex">
          <div className="grow">
            <p className="muted t13">In the queue</p>
            <p style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1, marginTop: 2 }}>{waiting}</p>
          </div>
          <div className="grow">
            <p className="muted t13">Estimated wait</p>
            <p style={{ fontSize: 22, fontWeight: 600, marginTop: 10 }}>{s.showEstimates ? estimateFor(db, waiting + 1) : "Ask reception"}</p>
          </div>
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          Estimated from today&apos;s pace at this practice. It moves as the day moves — it isn&apos;t a booked time.
        </p>
      </div>
      <Link href={`/c/${s.slug}/join`} className={`btn btn-primary lg ${open ? "" : "disabled"}`} aria-disabled={!open} onClick={(e) => !open && e.preventDefault()}>
        Join the queue
      </Link>
      <button className="btn btn-secondary" onClick={() => setBooking(true)}>
        <CalendarClock size={16} /> Book a time instead
      </button>
      {myVisitActive && (
        <Link href={`/q/${DEMO_VISIT_ID}`} className="row-card" style={{ color: "inherit" }}>
          <span className="ic" style={{ background: "var(--primary-50)" }}><Clock size={18} color="#1d6f86" /></span>
          <div className="grow">
            <p className="t">Already in the queue?</p>
            <p className="s">Open Thabo&apos;s live status (demo)</p>
          </div>
        </Link>
      )}
      <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="flex gap12"><MapPin size={18} color="#64748b" /><div className="grow"><p className="t13">{s.address.split(",").slice(0, 2).join(",")}</p><a className="t12" href={`https://maps.google.com/?q=${encodeURIComponent(s.address)}`} target="_blank" rel="noreferrer">Open in Maps</a></div></div>
        <div className="flex gap12"><Phone size={18} color="#64748b" /><div><a href={`tel:${s.phone.replace(/\s/g, "")}`} className="t13">{s.phone}</a><p className="muted t12">Reception, {s.hours[0].open}–{s.hours[0].close}</p></div></div>
        <div className="flex gap12"><Clock size={18} color="#64748b" /><div className="t13">{hours.map(([d, h]) => <p key={d}>{d} {h}</p>)}</div></div>
      </div>
      <div className="banner info">
        <Info size={16} />
        <div>You can leave the building once you&apos;ve joined. We&apos;ll message you on WhatsApp or SMS when you&apos;re two away.</div>
      </div>
      {booking && <BookingRequest name={s.name} onClose={() => setBooking(false)} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="m-wrap">
      <div className="m-app">
        <div className="m-head">
          <Logo />
          <Link href="/find" className="t13 muted flex center gap8"><ArrowLeft size={14} /> Find a clinic</Link>
        </div>
        <div className="m-body">{children}</div>
      </div>
    </div>
  );
}

function BookingRequest({ name, onClose }: { name: string; onClose: () => void }) {
  const toast = useToast();
  const [who, setWho] = useState("");
  const [phone, setPhone] = useState("");
  const [when, setWhen] = useState("Morning");
  const [tried, setTried] = useState(false);
  return (
    <Modal
      title="Request a booking"
      sub={`${name} will confirm by WhatsApp.`}
      onClose={onClose}
      small
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setTried(true);
              if (!who.trim() || !validPhone(phone)) return;
              toast("Request noted — demo only, nothing was sent");
              onClose();
            }}
          >
            Send request
          </button>
        </>
      }
    >
      <Field label="Your name" error={tried && !who.trim() && "Enter your name"}>
        <input className="input" value={who} onChange={(e) => setWho(e.target.value)} />
      </Field>
      <Field label="Phone number" error={tried && !validPhone(phone) && "Enter a South African mobile number"}>
        <input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="082 000 0000" />
      </Field>
      <Field label="Preferred time">
        <select className="select" value={when} onChange={(e) => setWhen(e.target.value)}>
          {["Morning", "Midday", "Afternoon"].map((x) => <option key={x}>{x}</option>)}
        </select>
      </Field>
      <p className="hint">Any weekday, {DAYS[0]} to {DAYS[4]}. Booked patients still check in when they arrive.</p>
    </Modal>
  );
}
