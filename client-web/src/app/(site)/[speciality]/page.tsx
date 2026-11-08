import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingPage } from "@/components/front/ListingPage";
import { listingDescription, listingHeading, listingPath, specialityBySlug } from "@/lib/directory";
import { getListedSpecialities } from "@/lib/directory-facets";
import { pageMeta } from "@/lib/meta";

// Only specialities with listed practitioners exist as pages; anything else is a 404.
export const dynamicParams = false;
export const generateStaticParams = () => getListedSpecialities().map((s) => ({ speciality: s.slug }));

type Props = { params: Promise<{ speciality: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const spec = specialityBySlug((await params).speciality);
  return spec ? pageMeta(listingHeading(spec), listingDescription(spec), listingPath(spec)) : {};
}

export default async function SpecialityPage({ params }: Props) {
  const spec = specialityBySlug((await params).speciality);
  if (!spec) notFound();
  return <ListingPage spec={spec} />;
}
