import type { Metadata } from "next";
import { Playfair_Display, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { getToken } from "@/lib/auth-server";

// Sacred Curator typography (INTERFACE_SPEC §1.3). Each exposes a CSS variable
// consumed by the Tailwind @theme tokens in globals.css.
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
      className={`${playfair.variable} ${inter.variable} ${jetbrainsMono.variable}`}
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
