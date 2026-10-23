import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DemoPanel, ToastProvider } from "@/components/ui";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "BabyBlue — live queues for clinics (demo)",
  description: "Interactive demo of BabyBlue: patients join a clinic queue from their phone, reception runs one live list. All data is made up.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b5aa8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={inter.variable}>
      <body>
        <ToastProvider>
          {children}
          <DemoPanel />
        </ToastProvider>
      </body>
    </html>
  );
}
