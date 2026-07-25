import type { Metadata } from "next";
import {
  Playfair_Display,
  Inter,
  JetBrains_Mono,
  Manrope,
} from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { getToken } from "@/lib/auth-server";
import { cn } from "@/lib/utils";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

// Church Admin heading font — scoped via [data-section="church-admin"] in
// globals.css, so this never overrides system-admin's Playfair headings.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "KLT Cyber — Admin",
  description: "Administration console for KLT Cyber Church.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const token = await getToken();

  return (
    <html
      lang="en"
      className={cn(
        playfair.variable,
        inter.variable,
        jetbrainsMono.variable,
        manrope.variable,
        "font-sans",
      )}
      suppressHydrationWarning
    >
      <body
        className="font-body bg-parchment text-on-surface min-h-full"
        suppressHydrationWarning
      >
        <Providers initialToken={token}>{children}</Providers>
      </body>
    </html>
  );
}
