import { NextResponse } from "next/server";
import { NotConfiguredError, saveLead, validateLead } from "@/server/leads";

export const runtime = "nodejs";

// Best-effort, per-instance throttle. Real abuse protection belongs at the edge (see ARCHITECTURE.md).
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 8;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  // Honeypot: bots fill hidden fields. Pretend success without storing anything.
  if (body && typeof body === "object" && (body as Record<string, unknown>).website) return NextResponse.json({ ok: true }, { status: 201 });

  const { lead, errors } = validateLead(body);
  if (!lead) return NextResponse.json({ error: "validation", errors }, { status: 400 });
  try {
    await saveLead(lead);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    if (e instanceof NotConfiguredError) return NextResponse.json({ error: "not_configured" }, { status: 503 });
    console.error("lead save failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
