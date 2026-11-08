import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import "@babyblue/ui/styles/globals.css";
import { DemoPanel, ToastProvider } from "@babyblue/flow-demo/components/ui";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: { default: "BabyBlue OS", template: "%s · BabyBlue OS" },
  description: "Practice management for BabyBlue practices. Demo environment with fictional data.",
  applicationName: "BabyBlue OS",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#14364b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={`${inter.variable} ${manrope.variable}`}>
      <body>
        <ToastProvider>
          {children}
          <DemoPanel />
        </ToastProvider>
      </body>
    </html>
  );
}
