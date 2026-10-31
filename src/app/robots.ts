import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  if (!SITE.indexable) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/staff", "/q/", "/c/", "/api/"] },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
