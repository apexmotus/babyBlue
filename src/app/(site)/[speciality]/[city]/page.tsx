import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingPage } from "@/components/front/ListingPage";
import { listingDescription, listingHeading, listingPath, specialityBySlug } from "@/lib/directory";
import { getCities, getListedSpecialities, hasListings } from "@/lib/directory-facets";
import { pageMeta } from "@/lib/meta";

// Every speciality x city combination resolves, so the finder and shared links never hit a 404. Combinations with nobody
// listed show an honest empty state and are kept out of search engines and the sitemap.
export const dynamicParams = false;
export const generateStaticParams = () => getListedSpecialities().flatMap((s) => getCities().map((c) => ({ speciality: s.slug, city: c.slug })));

type Props = { params: Promise<{ speciality: string; city: string }> };

async function resolve(params: Props["params"]) {
  const { speciality, city } = await params;
  return { spec: specialityBySlug(speciality), city: getCities().find((c) => c.slug === city) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { spec, city } = await resolve(params);
  if (!spec || !city) return {};
  const meta = pageMeta(listingHeading(spec, city), listingDescription(spec, city), listingPath(spec, city));
  return hasListings(spec, city) ? meta : { ...meta, robots: { index: false, follow: true } };
}

export default async function SpecialityCityPage({ params }: Props) {
  const { spec, city } = await resolve(params);
  if (!spec || !city) notFound();
  return <ListingPage spec={spec} city={city} />;
}
