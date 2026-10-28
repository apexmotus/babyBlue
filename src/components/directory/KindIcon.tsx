import { Activity, Bone, Brain, Building2, Eye, HeartHandshake, Hospital, Leaf, SmilePlus, Stethoscope, type LucideProps } from "lucide-react";
import type { PracticeKind } from "@/lib/practices/types";

const ICONS: Record<PracticeKind, typeof Stethoscope> = {
  hospital: Hospital,
  clinic: Building2,
  doctor: Stethoscope,
  dentist: SmilePlus,
  physiotherapist: Activity,
  psychologist: Brain,
  dietitian: Leaf,
  optometrist: Eye,
  chiropractor: Bone,
  other: HeartHandshake,
};

/** Line icon for a kind of practice. Decorative: the kind's name is always written next to it. */
export function KindIcon({ kind, ...props }: { kind: PracticeKind } & LucideProps) {
  const Icon = ICONS[kind];
  return <Icon aria-hidden="true" {...props} />;
}
