import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

/** Previous / next links that keep the current search. Plain links, so it works without JavaScript. */
export function Pager({ page, pages, params }: { page: number; pages: number; params: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  const href = (n: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (n > 1) sp.set("page", String(n));
    const qs = sp.toString();
    return `/directory${qs ? `?${qs}` : ""}`;
  };
  return (
    <nav className="f-pager" aria-label="Pages of results">
      {page > 1 ? <Link href={href(page - 1)} rel="prev"><ArrowLeft size={16} aria-hidden="true" /> Previous</Link> : <span aria-hidden="true" />}
      <span>Page {page} of {pages}</span>
      {page < pages ? <Link href={href(page + 1)} rel="next">Next <ArrowRight size={16} aria-hidden="true" /></Link> : <span aria-hidden="true" />}
    </nav>
  );
}
