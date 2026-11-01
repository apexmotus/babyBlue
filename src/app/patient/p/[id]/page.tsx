"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, Clock, Info, Languages, MapPin, ShieldQuestion, UserX } from "lucide-react";
import { Avatar, Btn, Empty, Notice } from "@/components/app/primitives";
import { VerifiedBadge } from "@/components/patient/PractitionerCard";
import { SlotPicker } from "@/components/patient/SlotPicker";
import { fmtTime, money, relativeDay } from "@/lib/format";
import { getProfile } from "@/lib/patient-data";
import { holdSlot } from "@/lib/api/patient";
import { friendlyError } from "@/lib/api/messages";
import { useSession } from "@/local/auth";
import { useQuery } from "@/local/hooks";
import { useToast } from "@/components/ui";

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <Profile />
    </Suspense>
  );
}

function Profile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const { session } = useSession("patient");
  const uid = session?.userId ?? null;
  const profile = useQuery(() => getProfile(uid, id), [uid, id]);
  const p = profile.data;

  const [service, setService] = useState<string | null>(search.get("service"));
  const [slot, setSlot] = useState<string | null>(search.get("slot"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Default to the first service once loaded.
  useEffect(() => { if (p && !service) setService(p.services[0]?.id ?? null); }, [p, service]);

  if (profile.loading && !p) return <ProfileSkeleton />;
  if (!p) {
    return (
      <div className="a-card"><Empty icon={<UserX size={28} />} title="We can't find that practitioner" action={<Link href="/patient/search" className="a-btn primary">Browse practitioners</Link>}>They may no longer be listed.</Empty></div>
    );
  }

  const svc = p.services.find((s) => s.id === service) ?? null;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.practice_name} ${p.address ?? ""} ${p.city ?? ""}`)}`;

  async function cont() {
    if (!svc || !slot) return;
    if (!uid) {
      const back = `/patient/p/${id}?service=${svc.id}&slot=${encodeURIComponent(slot)}`;
      router.push(`/patient/login?next=${encodeURIComponent(back)}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { id: holdId } = await holdSlot(uid, { practitioner_id: id, service_id: svc.id, starts_at: slot });
      router.push(`/patient/book/${holdId}`);
    } catch (e) {
      setError(friendlyError(e));
      setSlot(null);
      toast("That time is no longer available");
      setBusy(false);
    }
  }

  return (
    <>
      <Link href="/patient/search" className="a-link" style={{ display: "inline-flex", gap: 6, alignItems: "center", marginBottom: 16, fontSize: 14 }}><ArrowLeft size={16} /> Back to results</Link>
      <div className="pt-profile">
          <section className="a-card pad pt-area-head" style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
            <Avatar name={p.display_name} size={96} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <h1 style={{ fontSize: 28, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{p.display_name} <VerifiedBadge status={p.verification_status} /></h1>
              <p style={{ color: "var(--ink-2)", marginTop: 4, fontWeight: 500 }}>{p.title ?? p.speciality} · {p.speciality}</p>
              <p style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "flex-start", color: "var(--ink-2)", fontSize: 14.5 }}>
                <MapPin size={17} style={{ flex: "none", marginTop: 2 }} />
                <span><b style={{ color: "var(--deep)" }}>{p.practice_name}</b><br />{p.address}, {p.city} · <a href={maps} target="_blank" rel="noreferrer">Directions</a></span>
              </p>
              <p style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center", color: "var(--ink-2)", fontSize: 14.5 }}>
                <Languages size={17} /> {p.languages.join(" · ")}
              </p>
            </div>
          </section>

        <aside className="a-card pt-book pt-area-book" aria-label="Book an appointment">
          <div>
            <h2 style={{ fontSize: 21 }}>Book an appointment</h2>
            <p className="a-hint" style={{ marginTop: 2 }}>Times shown are open right now.</p>
          </div>
          <div role="radiogroup" aria-label="Service" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {p.services.map((s) => (
              <button key={s.id} className="pt-svc" role="radio" aria-checked={service === s.id} onClick={() => { setService(s.id); setSlot(null); }}>
                <span className="radio" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: "block", color: "var(--deep)", fontSize: 14.5 }}>{s.name}</b>
                  <span style={{ color: "var(--ink-3)", fontSize: 13, display: "inline-flex", gap: 5, alignItems: "center" }}><Clock size={13} /> {s.duration_min} min</span>
                </span>
                <b className="tnum" style={{ color: "var(--deep)" }}>{money(s.price_cents)}</b>
              </button>
            ))}
          </div>
          <hr className="a-divider" />
          <SlotPicker userId={uid} practitionerId={id} serviceId={service} value={slot} onChange={(v) => { setSlot(v); setError(""); }} />
          {error && <Notice tone="bad" icon={<Info size={18} />}>{error}</Notice>}
          {svc && slot && (
            <div style={{ background: "#f1f8fa", borderRadius: 16, padding: "12px 14px", fontSize: 14 }}>
              <b style={{ color: "var(--deep)" }}>{svc.name}</b>, {relativeDay(slot)} at {fmtTime(slot)}
              <span style={{ color: "var(--ink-2)" }}> · {svc.duration_min} min · {money(svc.price_cents)}</span>
            </div>
          )}
          <Btn className="primary lg block" disabled={!svc || !slot} loading={busy} onClick={cont}>{uid ? "Continue" : "Sign in to continue"}</Btn>
          <p className="a-hint" style={{ textAlign: "center" }}>Free cancellation up to {p.cancellation_notice_hours} hours before.</p>
        </aside>

        <div className="pt-area-rest">
          <section className="a-card pad">
            <h2 style={{ fontSize: 19, marginBottom: 10 }}>About</h2>
            <p style={{ color: "var(--ink-2)", lineHeight: 1.7 }}>{p.bio}</p>
          </section>

          <section className="a-card pad">
            <h2 style={{ fontSize: 19, marginBottom: 12 }}>Services & fees</h2>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {p.services.map((s, i) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "14px 0", borderTop: i ? "1px solid var(--line-2)" : 0 }}>
                  <div><b style={{ color: "var(--deep)" }}>{s.name}</b><p style={{ color: "var(--ink-2)", fontSize: 14, marginTop: 2 }}>{s.description}</p></div>
                  <div style={{ textAlign: "right", flex: "none" }}><b className="tnum" style={{ color: "var(--deep)" }}>{money(s.price_cents)}</b><p style={{ color: "var(--ink-3)", fontSize: 13 }}>{s.duration_min} min</p></div>
                </div>
              ))}
            </div>
          </section>

          <section className="a-card pad" style={{ display: "flex", gap: 14 }}>
            {p.verification_status === "verified" ? <BadgeCheck size={26} color="#1d6f86" style={{ flex: "none" }} /> : <ShieldQuestion size={26} color="#5a7282" style={{ flex: "none" }} />}
            <div>
              <h2 style={{ fontSize: 17 }}>{p.verification_status === "verified" ? "Registration verified" : p.verification_status === "pending" ? "Verification pending" : "Not yet verified"}</h2>
              <p style={{ color: "var(--ink-2)", fontSize: 14.5, marginTop: 4 }}>
                {p.verification_status === "verified"
                  ? "BabyBlue checked this practitioner's registration against the relevant statutory council's public register."
                  : p.verification_status === "pending"
                    ? "This practitioner has submitted their registration details and BabyBlue is reviewing them."
                    : "BabyBlue has not verified this practitioner's registration. You can still book, and you can check registration with the relevant council yourself."}
              </p>
            </div>
          </section>
        </div>


      </div>
    </>
  );
}

function ProfileSkeleton() {
  return (
    <div className="pt-profile">
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="a-card pad" style={{ display: "flex", gap: 20 }}><div className="a-skel" style={{ width: 96, height: 96, borderRadius: 48 }} /><div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}><div className="a-skel" style={{ height: 28, width: "50%" }} /><div className="a-skel" style={{ height: 16, width: "35%" }} /><div className="a-skel" style={{ height: 16, width: "60%" }} /></div></div>
        <div className="a-card pad"><div className="a-skel" style={{ height: 120 }} /></div>
      </div>
      <div className="a-card pad"><div className="a-skel" style={{ height: 420 }} /></div>
    </div>
  );
}
