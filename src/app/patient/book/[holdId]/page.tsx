"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarClock, Info, ShieldCheck, TimerOff } from "lucide-react";
import { Avatar, Btn, Empty, Notice } from "@/components/app/primitives";
import { RequireAuth } from "@/components/patient/RequireAuth";
import { fmtLongDate, fmtTime, money } from "@/lib/format";
import { friendlyError, mutate, query } from "@/local/db";
import { useSession } from "@/local/auth";
import { useNow, useQuery } from "@/local/hooks";

interface Hold {
  id: string; starts_at: Date; ends_at: Date; expires_at: Date; practitioner_id: string; display_name: string; speciality: string;
  service_name: string; price_cents: number | null; duration_min: number; practice_name: string; cancellation_notice_hours: number; address: string | null; city: string | null;
}

export default function BookPage() {
  return (
    <RequireAuth>
      <Confirm />
    </RequireAuth>
  );
}

function Ring({ left, total }: { left: number; total: number }) {
  const r = 36, c = 2 * Math.PI * r;
  const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
  return (
    <div className="pt-ring" role="timer" aria-label={`Time held: ${mm} minutes ${ss} seconds`}>
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={r} fill="none" stroke="#dcebf0" strokeWidth="7" />
        <circle cx="42" cy="42" r={r} fill="none" stroke={left < 60000 ? "#b4332c" : "#3097b2"} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, left) / total)} style={{ transition: "stroke-dashoffset 1s linear" }} />
      </svg>
      <span className="tnum">{mm}:{String(ss).padStart(2, "0")}</span>
    </div>
  );
}

function Confirm() {
  const { holdId } = useParams<{ holdId: string }>();
  const router = useRouter();
  const { session } = useSession("patient");
  const uid = session!.userId;
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const hold = useQuery(
    async () =>
      (await query<Hold>(uid, `select h.id, h.starts_at, h.ends_at, h.expires_at, h.practitioner_id, p.display_name, p.speciality, s.name service_name, s.price_cents, s.duration_min,
          pr.name practice_name, pr.cancellation_notice_hours, l.address, l.city
        from public.slot_holds h join public.practitioners p on p.id = h.practitioner_id join public.services s on s.id = h.service_id join public.practices pr on pr.id = h.practice_id
        left join lateral (select address, city from public.locations where practice_id = pr.id limit 1) l on true where h.id = $1`, [holdId]))[0] ?? null,
    [uid, holdId],
  );

  if (hold.loading && hold.data === undefined) return <div className="pt-narrow"><div className="a-card pad"><div className="a-skel" style={{ height: 320 }} /></div></div>;
  const h = hold.data;
  const left = h ? h.expires_at.getTime() - now : -1;

  if (!h || left <= 0) {
    return (
      <div className="pt-narrow a-card">
        <Empty icon={<TimerOff size={28} />} title="That time is no longer held" action={<Link href={h ? `/patient/p/${h.practitioner_id}` : "/patient/search"} className="a-btn primary">Choose a time</Link>}>
          Held times are kept for 5 minutes. Pick a time again and it will be reserved for you.
        </Empty>
      </div>
    );
  }

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const [{ id }] = await mutate<{ id: string }>(uid, "select public.book_appointment($1) as id", [holdId]);
      router.replace(`/patient/appointments/${id}?booked=1`);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  }
  async function release() {
    await mutate(uid, "select public.release_hold($1)", [holdId]);
    router.push(`/patient/p/${h!.practitioner_id}`);
  }

  return (
    <div className="pt-narrow" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 28 }}>Confirm your appointment</h1>
        <p style={{ color: "var(--ink-2)", marginTop: 4 }}>One last look before we book it.</p>
      </div>

      <div className="a-card pad" style={{ display: "flex", gap: 18, alignItems: "center", background: "linear-gradient(135deg,#eaf5f8,#e6f3ec)", border: 0 }}>
        <Ring left={left} total={5 * 60000} />
        <div>
          <p style={{ fontWeight: 700, color: "var(--deep)" }}>We&apos;re holding this time for you</p>
          <p style={{ color: "var(--ink-2)", fontSize: 14 }}>Nobody else can book it while you confirm.</p>
        </div>
      </div>

      <section className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Avatar name={h.display_name} size={56} />
          <div>
            <h2 style={{ fontSize: 19 }}>{h.display_name}</h2>
            <p style={{ color: "var(--ink-2)", fontSize: 14 }}>{h.speciality}</p>
          </div>
        </div>
        <hr className="a-divider" />
        <dl className="a-kv">
          <dt>Service</dt><dd>{h.service_name}</dd>
          <dt>Date</dt><dd>{fmtLongDate(h.starts_at)}</dd>
          <dt>Time</dt><dd className="tnum">{fmtTime(h.starts_at)} – {fmtTime(h.ends_at)} ({h.duration_min} min)</dd>
          <dt>Where</dt><dd style={{ fontWeight: 500 }}>{h.practice_name}<br /><span style={{ color: "var(--ink-2)" }}>{h.address}, {h.city}</span></dd>
          <dt>Fee</dt><dd className="tnum">{money(h.price_cents) || "Ask the practice"}</dd>
        </dl>
      </section>

      <Notice tone="info" icon={<Info size={18} />}>
        You can cancel or reschedule free of charge up to <b>{h.cancellation_notice_hours} hours</b> before your appointment. Fees are paid to the practice, not BabyBlue.
      </Notice>
      {error && <Notice tone="bad" icon={<Info size={18} />}>{error}</Notice>}

      <Btn className="primary lg block" loading={busy} onClick={confirm}><CalendarClock size={19} /> Confirm booking</Btn>
      <button className="a-link" style={{ textAlign: "center" }} onClick={release}>Choose a different time</button>
      <p className="a-hint" style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}><ShieldCheck size={14} /> The practice sees your name and contact details so it can look after your visit. Nothing else.</p>
    </div>
  );
}
