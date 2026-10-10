import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Plus_Jakarta_Sans,
  Spline_Sans_Mono,
} from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { getToken } from "@/lib/auth-server";
import { cn } from "@/lib/utils";

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
  // getToken() does a real network round trip (cookie -> Convex JWT exchange).
  // If that's unreachable (offline, DNS failure, Convex down), it must not
  // crash the whole app before React even mounts our error/offline UI — fall
  // back to no pre-fetched token, which is the same first-paint path an
  // unauthenticated visitor already takes; the client resolves auth from
  // there once connectivity returns.
  let token: string | undefined;
  try {
    token = await getToken();
  } catch {
    token = undefined;
  }

  return (
    <html
      lang="en"
      className={cn(bricolage.variable, jakarta.variable, splineMono.variable)}
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
