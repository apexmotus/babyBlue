import { Bell, CalendarDays, Check, HeartPulse, Home, LayoutGrid, MapPin, Megaphone, MessageSquare, PieChart, Search, Settings, SmilePlus, Stethoscope, User, Users, Wallet, Activity, Leaf, Brain } from "lucide-react";

/**
 * Illustrative interface mockups for marketing use only.
 * Names, figures and availability shown are placeholders — they are never real practitioners or results.
 */

export function PhoneMock({ screen = "discover", className = "" }: { screen?: "discover" | "confirmed"; className?: string }) {
  return (
    <div className={`x-phone ${className}`} role="img" aria-label={screen === "discover" ? "Illustration of the BabyBlue App practitioner search screen" : "Illustration of a BabyBlue App booking confirmation screen"}>
      <div className="x-phone-frame"><div className="x-phone-screen">
        <div className="x-phone-notch" />
        <div className="x-ps-status"><span>9:41</span><span>●●●</span></div>
        {screen === "discover" ? (
          <>
            <div className="x-ps-body">
              <div className="x-ps-top">
                <span className="x-ps-logo">babyblue<i>.</i></span>
                <Bell size="1.3em" color="#14364b" />
              </div>
              <div className="x-ps-search"><Search size="1.1em" /> Practitioner, speciality or service…</div>
              <div className="x-ps-loc"><MapPin size="1.1em" color="#3097b2" /> Near you · change</div>
              <div className="x-ps-h">Popular services</div>
              <div className="x-ps-cats">
                {[[Stethoscope, "Doctors"], [SmilePlus, "Dentists"], [Brain, "Therapy"], [Activity, "Physio"], [Leaf, "Wellness"], [LayoutGrid, "More"]].map(([I, l]) => {
                  const Ic = I as typeof Stethoscope;
                  return (
                    <div className="x-ps-cat" key={l as string}><Ic /> {l as string}</div>
                  );
                })}
              </div>
              <div className="x-ps-h">Available today</div>
              <div className="x-ps-card">
                <div style={{ display: "flex", gap: "0.7em", alignItems: "center" }}>
                  <div className="x-ps-av" />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.35em" }}>
                    <b style={{ fontSize: "0.9em", color: "#14364b" }}>Example practitioner</b>
                    <div className="x-ps-sk" style={{ width: "62%" }} />
                  </div>
                </div>
                <div className="x-ps-slots"><b>09:00</b><b>10:30</b><b>14:00</b></div>
              </div>
            </div>
            <div className="x-ps-tabs">
              <span className="on"><Home />Home</span>
              <span><Search />Explore</span>
              <span><CalendarDays />Bookings</span>
              <span><User />Profile</span>
            </div>
          </>
        ) : (
          <div className="x-ps-body" style={{ alignItems: "center", textAlign: "center", paddingTop: "1.5em" }}>
            <div className="x-ps-ok"><Check strokeWidth={3} /></div>
            <div className="x-ps-h" style={{ fontSize: "1.35em" }}>Your appointment<br />is confirmed.</div>
            <div className="x-ps-sk" style={{ width: "70%" }} />
            <div className="x-ps-card" style={{ width: "100%", textAlign: "left", marginTop: "0.6em" }}>
              <div style={{ display: "flex", gap: "0.7em", alignItems: "center" }}>
                <div className="x-ps-av" />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4em" }}>
                  <b style={{ fontSize: "0.9em", color: "#14364b" }}>Example practitioner</b>
                  <div className="x-ps-sk" style={{ width: "55%" }} />
                </div>
              </div>
              <div className="x-ps-sk" style={{ width: "80%" }} />
            </div>
            <div style={{ width: "100%", background: "#14364b", color: "#fff", borderRadius: "99px", padding: "0.8em", fontWeight: 700, fontSize: "0.9em", marginTop: "0.4em" }}>Add to calendar</div>
          </div>
        )}
      </div></div>
    </div>
  );
}

const NAVI = [[LayoutGrid, "Dashboard"], [CalendarDays, "Calendar"], [Users, "Clients"], [Megaphone, "Growth"], [PieChart, "Insights"], [Wallet, "Payments"], [MessageSquare, "Messages"], [Settings, "Settings"]] as const;

export function LaptopMock({ className = "" }: { className?: string }) {
  return (
    <div className={`x-laptop ${className}`} role="img" aria-label="Illustration of the BabyBlue OS practitioner dashboard">
      <div className="x-laptop-lid">
        <div className="x-laptop-screen">
          <div className="x-os-side">
            <div className="x-os-logo">babyblue<i>OS</i></div>
            {NAVI.map(([I, l], i) => (
              <div key={l} className={`x-os-nav ${i === 0 ? "on" : ""}`}><I /> {l}</div>
            ))}
          </div>
          <div className="x-os-main">
            <div className="x-os-h">Good morning</div>
            <div className="x-os-kpis">
              {[["Today", "—"], ["New clients", "—"], ["Utilisation", "—"], ["Cancellations", "—"]].map(([k]) => (
                <div className="x-os-kpi" key={k}>
                  <small>{k}</small>
                  <b>00</b>
                </div>
              ))}
            </div>
            <div className="x-os-cols">
              <div className="x-os-panel">
                <h5>Today&apos;s appointments</h5>
                {[["08:30", "Consultation", "Completed", "g"], ["09:00", "Check-up", "Checked in", "g"], ["10:30", "Follow-up", "Confirmed", ""], ["11:15", "Consultation", "Confirmed", ""], ["13:00", "New client", "Pending", "w"], ["14:15", "Follow-up", "Confirmed", ""], ["15:30", "Check-up", "Confirmed", ""]].map(([t, s, st, c]) => (
                  <div className="x-os-row" key={t}><b>{t}</b><span>{s} · Example client</span><em className={c}>{st}</em></div>
                ))}
              </div>
              <div className="x-os-panel">
                <h5>Booking activity</h5>
                <svg viewBox="0 0 200 90" width="100%" role="presentation" aria-hidden="true">
                  <defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3097b2" stopOpacity="0.35" /><stop offset="1" stopColor="#3097b2" stopOpacity="0" /></linearGradient></defs>
                  <path d="M0 70 L30 62 L60 66 L90 48 L120 52 L150 30 L200 14 L200 90 L0 90Z" fill="url(#lg)" />
                  <path d="M0 70 L30 62 L60 66 L90 48 L120 52 L150 30 L200 14" fill="none" stroke="#3097b2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <h5 style={{ marginTop: "0.8em" }}>Utilisation this week</h5>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "0.6em", height: "5.5em" }} aria-hidden="true">
                  {[55, 72, 64, 80, 48].map((h, i) => (<div key={i} style={{ flex: 1, height: h + "%", background: i === 3 ? "#14364b" : "#bde6ef", borderRadius: "0.4em 0.4em 0 0" }} />))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="x-laptop-base" />
    </div>
  );
}

export function MockCaption({ children = "Illustrative interface. Names, times and figures are examples, not real practitioners or results." }: { children?: string }) {
  return (
    <p className="x-mock-cap">
      <HeartPulse size={14} aria-hidden="true" /> {children}
    </p>
  );
}
