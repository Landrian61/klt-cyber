import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Plus_Jakarta_Sans,
  Spline_Sans_Mono,
} from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { getToken } from "@/lib/auth-server";

// Typography shared with the mobile app for a cohesive brand: Bricolage
// Grotesque (display), Plus Jakarta Sans (all UI/body), Spline Sans Mono
// (amounts/counts). Each exposes a CSS variable consumed by the Tailwind @theme
// tokens in globals.css. Loaded as variable fonts (full weight range).
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
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

export const metadata: Metadata = {
  title: "KLT Cyber — Admin",
  description: "Administration console for KLT Cyber Church.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the session token server-side so the Convex client is authenticated
  // on first paint (avoids an unauthenticated flash). Undefined when signed out.
  const token = await getToken();

  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${jakarta.variable} ${splineMono.variable}`}
      suppressHydrationWarning
    >
      {/*
        suppressHydrationWarning: browser extensions (Grammarly, password
        managers, dark-mode tools, etc.) inject attributes onto <html>/<body>
        before React hydrates, which the server HTML can't predict. This flag
        relaxes attribute checks on these two elements only (one level deep) —
        it does NOT hide mismatches inside the component tree.
      */}
      <body
        className="font-body bg-parchment text-on-surface min-h-full"
        suppressHydrationWarning
      >
        <Providers initialToken={token}>{children}</Providers>
      </body>
    </html>
  );
}
