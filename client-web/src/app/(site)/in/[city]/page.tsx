import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingPage } from "@/components/front/ListingPage";
import { listingDescription, listingHeading, listingPath } from "@/lib/directory";
import { getCities } from "@/lib/directory-facets";
import { pageMeta } from "@/lib/meta";

export const dynamicParams = false;
export const generateStaticParams = () => getCities().map((c) => ({ city: c.slug }));

type Props = { params: Promise<{ city: string }> };
const find = async (params: Props["params"]) => {
  const { city } = await params;
  return getCities().find((c) => c.slug === city);
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const city = await find(params);
  return city ? pageMeta(listingHeading(undefined, city), listingDescription(undefined, city), listingPath(undefined, city)) : {};
}

export default async function CityPage({ params }: Props) {
  const city = await find(params);
  if (!city) notFound();
  return <ListingPage city={city} />;
}
