import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

const PATHS = ["/", "/app", "/practitioners", "/os", "/growth", "/flow", "/solutions", "/pricing", "/about", "/contact", "/privacy", "/terms", "/popia"];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PATHS.map((p) => ({ url: `${SITE.url}${p}`, lastModified, changeFrequency: p === "/" ? "weekly" : "monthly", priority: p === "/" ? 1 : 0.7 }));
}
