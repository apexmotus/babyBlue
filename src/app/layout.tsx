import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";
import { DemoPanel, ToastProvider } from "@/components/ui";
import { SITE } from "@/lib/site";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `BabyBlue — ${SITE.tagline}`, template: "%s · BabyBlue" },
  description: SITE.description,
  applicationName: "BabyBlue",
  openGraph: {
    type: "website",
    siteName: "BabyBlue",
    locale: "en_ZA",
    title: `BabyBlue — ${SITE.tagline}`,
    description: SITE.description,
    images: [{ url: "/og", width: 1200, height: 630, alt: "BabyBlue — Care, connected." }],
  },
  twitter: { card: "summary_large_image", title: `BabyBlue — ${SITE.tagline}`, description: SITE.description, images: ["/og"] },
  robots: SITE.indexable ? { index: true, follow: true } : { index: false, follow: false },
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
