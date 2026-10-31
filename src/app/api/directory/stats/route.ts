import { getDirectorySummary } from "@/lib/practices/data";

// Public numbers only (no records): how many batches and practices are live. Built at deploy time, so the release
// checks can confirm exactly what production is serving.
export const dynamic = "force-static";

export function GET() {
  return Response.json(getDirectorySummary(), { headers: { "cache-control": "public, max-age=60" } });
}
