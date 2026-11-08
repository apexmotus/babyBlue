"use client";

import { useParams } from "next/navigation";
import { GrowthDetail } from "@/components/os/GrowthDetail";

export default function OperatorRequestPage() {
  const { id } = useParams<{ id: string }>();
  return <GrowthDetail id={id} mode="operator" />;
}
