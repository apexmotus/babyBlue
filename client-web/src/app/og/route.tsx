import { ImageResponse } from "next/og";

export const runtime = "nodejs";

/** Generated Open Graph / Twitter image: /og?title=…&sub=… (1200×630, brand palette). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("title") ?? "Care, connected.").slice(0, 90);
  const sub = (searchParams.get("sub") ?? "Better access to care. Stronger practices.").slice(0, 140);
  const big = title.length > 48 ? 56 : 72;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg,#f5f8f6 0%,#bde6ef 100%)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 54, fontWeight: 800, letterSpacing: -2, color: "#14364b" }}>
          baby<span style={{ color: "#3097b2" }}>blue</span><span style={{ color: "#3097b2" }}>.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", fontSize: big, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05, color: "#14364b" }}>{title}</div>
          <div style={{ display: "flex", fontSize: 30, lineHeight: 1.35, color: "#44606f", maxWidth: 900 }}>{sub}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", width: 64, height: 8, borderRadius: 8, background: "#3097b2" }} />
          <div style={{ display: "flex", width: 24, height: 8, borderRadius: 8, background: "#8bc5a9" }} />
          <div style={{ display: "flex", fontSize: 26, color: "#14364b", marginLeft: 8, fontWeight: 700 }}>Care, connected.</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
