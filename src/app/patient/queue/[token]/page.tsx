"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, DoorOpen, LogOut, Users, XCircle } from "lucide-react";
import { Badge, Btn, Empty, Sheet } from "@/components/app/primitives";
import { Logo } from "@/components/ui";
import { mutate, query } from "@/local/db";
import { useQuery } from "@/local/hooks";

interface Status { status: "waiting" | "in_consultation" | "done" | "cancelled"; queue_position: number | null; practice_name: string }

export default function QueueStatus() {
  const { token } = useParams<{ token: string }>();
  const [leave, setLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const q = useQuery(() => query<Status>(null, "select * from public.get_queue_status($1)", [token]).then((r) => r[0] ?? null), [token], { poll: 3000 });
  const s = q.data;

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div style={{ maxWidth: 460, margin: "0 auto", padding: "28px 20px 60px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ textAlign: "center" }}><Logo size={30} /></div>
      {children}
    </div>
  );

  if (q.loading && q.data === undefined) return <Shell><div className="a-card pad"><div className="a-skel" style={{ height: 320 }} /></div></Shell>;
  if (!s) return <Shell><div className="a-card"><Empty icon={<Users size={28} />} title="We can't find your place in the queue" action={<Link href="/patient" className="a-btn primary">Go to BabyBlue</Link>}>The link may be old.</Empty></div></Shell>;

  const pos = s.queue_position ?? 0;
  return (
    <Shell>
      <p style={{ textAlign: "center", color: "var(--ink-2)", fontSize: 14 }}>Your visit at <b style={{ color: "var(--deep)" }}>{s.practice_name}</b></p>
      <div className="a-card pad" style={{ textAlign: "center", padding: "34px 24px" }} aria-live="polite">
        {s.status === "waiting" && (
          <>
            <Badge tone="neutral" dot>Waiting</Badge>
            <div className="pt-queue-num" style={{ marginTop: 18 }}>#{pos}</div>
            <p style={{ color: "var(--ink-2)", marginTop: 6 }}>{pos === 1 ? "You're next in line" : `${pos - 1} ${pos - 1 === 1 ? "person" : "people"} ahead of you`}</p>
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--line-2)" }}>
              <p style={{ color: "var(--ink-3)", fontSize: 13.5 }}>Estimated wait</p>
              <p style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 24, color: "var(--deep)", marginTop: 2 }}>{pos === 1 ? "Under 10 min" : `${(pos - 1) * 10}–${(pos - 1) * 10 + 15} min`}</p>
              <p className="a-hint" style={{ marginTop: 4 }}>An estimate from today&apos;s pace. It isn&apos;t a booked time.</p>
            </div>
          </>
        )}
        {s.status === "in_consultation" && (
          <>
            <Badge tone="info" dot>Your turn</Badge>
            <div style={{ width: 84, height: 84, borderRadius: "50%", background: "var(--sky)", margin: "20px auto 0", display: "grid", placeItems: "center" }}><DoorOpen size={38} color="#14364b" /></div>
            <h1 style={{ fontSize: 28, marginTop: 16 }}>You&apos;re being seen now</h1>
            <p style={{ color: "var(--ink-2)", marginTop: 6 }}>Please go through to the consulting room.</p>
          </>
        )}
        {s.status === "done" && (
          <>
            <Badge tone="good" dot>Done</Badge>
            <div style={{ width: 84, height: 84, borderRadius: "50%", background: "var(--sage)", margin: "20px auto 0", display: "grid", placeItems: "center" }}><CheckCircle2 size={42} color="#fff" /></div>
            <h1 style={{ fontSize: 28, marginTop: 16 }}>Visit complete</h1>
            <p style={{ color: "var(--ink-2)", marginTop: 6 }}>Thank you. Take care.</p>
          </>
        )}
        {s.status === "cancelled" && (
          <>
            <Badge tone="bad" dot>Not in queue</Badge>
            <div style={{ width: 84, height: 84, borderRadius: "50%", background: "var(--bad-bg)", margin: "20px auto 0", display: "grid", placeItems: "center" }}><XCircle size={42} color="#b4332c" /></div>
            <h1 style={{ fontSize: 26, marginTop: 16 }}>You&apos;re no longer in the queue</h1>
            <p style={{ color: "var(--ink-2)", marginTop: 6 }}>If this is a mistake, please speak to reception.</p>
          </>
        )}
      </div>
      {s.status === "waiting" && (
        <>
          <p className="a-hint" style={{ textAlign: "center", display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}><span className="live-dot" /> Updates automatically. You can step outside.</p>
          <button className="a-link" style={{ textAlign: "center", color: "var(--ink-2)" }} onClick={() => setLeave(true)}>Leave the queue</button>
        </>
      )}
      {leave && (
        <Sheet title="Leave the queue?" sub={`You'll lose position #${pos}. To be seen you'd have to join again, behind everyone waiting.`} onClose={() => setLeave(false)} size="narrow"
          footer={<><button className="a-btn primary" onClick={() => setLeave(false)}>Keep my place</button><Btn className="danger" loading={busy} onClick={async () => { setBusy(true); await mutate(null, "select public.leave_queue($1)", [token]); setBusy(false); setLeave(false); }}><LogOut size={16} /> Leave</Btn></>}>
          <span />
        </Sheet>
      )}
    </Shell>
  );
}
