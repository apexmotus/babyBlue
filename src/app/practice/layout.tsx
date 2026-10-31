import type { Metadata } from "next";
import "@/styles/app.css";
import "@/styles/patient.css";
import "@/styles/os.css";
import { OsRoot } from "@/components/os/OsRoot";

export const metadata: Metadata = {
  title: { default: "BabyBlue OS — run your practice", template: "%s · BabyBlue OS" },
  description: "Calendar, appointments, clients, queue, insights and marketing for practices. Demo environment with fictional data.",
  robots: { index: false, follow: false },
};

export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  return <OsRoot>{children}</OsRoot>;
}
