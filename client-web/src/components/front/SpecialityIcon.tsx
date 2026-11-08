import { Activity, Bone, Brain, Eye, Leaf, MessagesSquare, SmilePlus, Stethoscope, type LucideProps } from "lucide-react";
import type { SpecialityIconKey } from "@/lib/directory";

const ICONS = { stethoscope: Stethoscope, smile: SmilePlus, activity: Activity, brain: Brain, messages: MessagesSquare, leaf: Leaf, eye: Eye, bone: Bone } as const;

/** Line icon for a speciality. Decorative: the label next to it carries the meaning. */
export function SpecialityIcon({ name, ...props }: { name: SpecialityIconKey } & LucideProps) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" {...props} />;
}
