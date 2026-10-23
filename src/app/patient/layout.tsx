import type { Metadata } from "next";
import "@/styles/app.css";
import "@/styles/patient.css";
import { PatientRoot } from "@/components/patient/PatientRoot";

export const metadata: Metadata = {
  title: { default: "BabyBlue — find and book care", template: "%s · BabyBlue" },
  description: "Find practitioners, see real availability and book in a few taps. Demo environment with fictional practitioners.",
  robots: { index: false, follow: false },
};

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return <PatientRoot>{children}</PatientRoot>;
}
