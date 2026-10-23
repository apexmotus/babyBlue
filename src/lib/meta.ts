import type { Metadata } from "next";

/** Page metadata with canonical URL and a per-page generated Open Graph / Twitter image. */
export function pageMeta(title: string, description: string, path: string): Metadata {
  const og = `/og?title=${encodeURIComponent(title)}&sub=${encodeURIComponent(description.slice(0, 120))}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${title} · BabyBlue`, description, url: path, images: [{ url: og, width: 1200, height: 630, alt: `${title} — BabyBlue` }] },
    twitter: { card: "summary_large_image", title: `${title} · BabyBlue`, description, images: [og] },
  };
}
