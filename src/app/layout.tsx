import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Nav } from "@/components/site/nav";
import { Footer } from "@/components/site/footer";
import { ThemeProvider, themeScript } from "@/components/theme-provider";
import { SessionProvider } from "@/components/session-provider";
import { MotionProvider } from "@/components/motion";
import { getCachedTopTags } from "@/db/cached";
import "./globals.css";

/**
 * Typography — self-hosted variable fonts via `next/font/local`.
 *
 * Two families, three weights, chosen once and never revisited:
 *  • **Inter** for interface, metadata and long-form sans — a variable font, so a
 *    single 48 KB file covers 100–900 instead of four static files.
 *  • **Playfair Display** for headlines and article body — the editorial voice.
 *
 * Self-hosted rather than `next/font/google` for three reasons: the build has no
 * third-party dependency, first paint saves a DNS lookup and a TLS handshake to
 * `fonts.gstatic.com`, and the files are served from the same origin as the page
 * (so they share its HTTP/2 connection and cache). `next/font` still generates
 * the `@font-face` rules, fingerprints the URLs for immutable caching and
 * preloads the two upright faces. See `src/app/fonts/README.md`.
 */
const inter = localFont({
  src: [
    { path: "./fonts/inter-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/inter-latin-wght-italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-inter",
  display: "swap",
  preload: true,
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

const playfair = localFont({
  src: [
    { path: "./fonts/playfair-display-latin-wght-normal.woff2", weight: "400 900", style: "normal" },
    { path: "./fonts/playfair-display-latin-wght-italic.woff2", weight: "400 900", style: "italic" },
  ],
  variable: "--font-playfair",
  display: "swap",
  // Preloading a display face the reader may not reach is a wasted request; the
  // article body uses it, but the fallback metrics are close enough to swap late.
  preload: false,
  fallback: ["ui-serif", "Georgia", "Times New Roman", "serif"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Folio — publish and read, free forever",
    template: "%s · Folio",
  },
  description:
    "Folio is a fast, quiet place to publish long-form writing. Free to read, free to publish, no paywalls and no algorithm.",
  applicationName: "Folio",
  authors: [{ name: "Folio" }],
  openGraph: {
    type: "website",
    siteName: "Folio",
    title: "Folio — publish and read, free forever",
    description: "A fast, quiet place to publish long-form writing.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Folio — publish and read, free forever",
    description: "A fast, quiet place to publish long-form writing.",
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d10" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Powers the ⌘K palette suggestions. Served from the tagged data cache, so it
  // costs one query per revalidation window rather than one per request — and a
  // database blip degrades to an empty suggestion list rather than a 500 on
  // every route in the application.
  const tags = await getCachedTopTags(12).catch(() => []);
  const suggestions = tags.map((tag) => tag.tag);

  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`} suppressHydrationWarning>
      <head>
        {/* Blocking, ~200 bytes: sets the theme class before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/*
          No font or CDN preconnects are needed: every asset is same-origin.
          `preconnect` only earns its place for third-party hosts, and Folio has none.
        */}
      </head>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-paper-raised focus:px-4 focus:py-2 focus:text-sm focus:shadow-[var(--shadow-lg)]"
        >
          Skip to content
        </a>

        <ThemeProvider>
          <SessionProvider>
            <MotionProvider>
              <Nav suggestions={suggestions} />
              <main id="main">{children}</main>
              <Footer />
            </MotionProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
