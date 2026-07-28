import type { Metadata } from "next";
import {
<<<<<<< HEAD
  Playfair_Display,
  Inter,
  JetBrains_Mono,
  Manrope,
=======
  Bricolage_Grotesque,
  Plus_Jakarta_Sans,
  Spline_Sans_Mono,
>>>>>>> 13cffc92a8816f1bab8b0d9ec21062b6969098e7
} from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { getToken } from "@/lib/auth-server";
import { cn } from "@/lib/utils";

<<<<<<< HEAD
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
=======
// Typography shared with the mobile app for a cohesive brand: Bricolage
// Grotesque (display), Plus Jakarta Sans (all UI/body), Spline Sans Mono
// (amounts/counts). Each exposes a CSS variable consumed by the Tailwind @theme
// tokens in globals.css. Loaded as variable fonts (full weight range).
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
>>>>>>> 13cffc92a8816f1bab8b0d9ec21062b6969098e7
  subsets: ["latin"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const splineMono = Spline_Sans_Mono({
  variable: "--font-spline-mono",
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
<<<<<<< HEAD
      className={cn(
        playfair.variable,
        inter.variable,
        jetbrainsMono.variable,
        manrope.variable,
        "font-sans",
      )}
=======
      className={`${bricolage.variable} ${jakarta.variable} ${splineMono.variable}`}
>>>>>>> 13cffc92a8816f1bab8b0d9ec21062b6969098e7
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
