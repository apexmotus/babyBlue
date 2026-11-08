"use client";

import { useParams } from "next/navigation";
import { GrowthDetail } from "@/components/os/GrowthDetail";
import { OwnerOnly } from "@/components/os/OwnerOnly";

export default function GrowthRequestPage() {
  const { id } = useParams<{ id: string }>();
  return <OwnerOnly><GrowthDetail id={id} mode="owner" /></OwnerOnly>;
}
