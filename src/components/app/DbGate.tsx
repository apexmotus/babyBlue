"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getDb, resetLocalDb } from "@/local/db";
import { Logo } from "@/components/ui";

const TIPS = [
  "Starting a real PostgreSQL database inside your browser…",
  "Applying the schema and security rules…",
  "Loading fictional practices and practitioners…",
  "Generating two months of demo appointments…",
];

/** Boots the local database (first visit takes a few seconds) before any screen runs queries. */
export function DbGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [tip, setTip] = useState(0);

  useEffect(() => {
    let alive = true;
    const t0 = performance.now();
    getDb().then(
      () => { console.info(`[babyblue] local database ready in ${Math.round(performance.now() - t0)} ms`); if (alive) setState("ready"); },
      (e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      },
    );
    const t = setInterval(() => setTip((x) => Math.min(x + 1, TIPS.length - 1)), 2200);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (state === "ready") return <>{children}</>;
  return (
    <div className="a-splash">
      <div className="a-splash-in">
        <Logo size={40} />
        {state === "loading" ? (
          <>
            <div className="a-orbit" role="status" aria-label="Loading" />
            <div>
              <p style={{ fontWeight: 600, color: "var(--deep)" }}>Setting up your BabyBlue demo</p>
              <p style={{ color: "var(--ink-2)", fontSize: 14, marginTop: 6 }}>{TIPS[tip]}</p>
              <p style={{ color: "var(--ink-3)", fontSize: 12.5, marginTop: 14 }}>First visit only. After this it opens instantly.</p>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontWeight: 700, color: "var(--deep)" }}>The local database couldn&apos;t start.</p>
            <p style={{ color: "var(--ink-2)", fontSize: 14 }}>{error}</p>
            <button className="a-btn primary" onClick={() => resetLocalDb()}>Reset local data and retry</button>
          </>
        )}
      </div>
    </div>
  );
}
