import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/playfair-display/wght.css';
import './globals.css';

import { Footer } from '@/components/footer';
import { Header } from '@/components/header';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Folio — publish and read, free',
    template: '%s · Folio',
  },
  description:
    'Folio is a lightning-fast publishing platform. Write in Markdown, publish in one click, and read in a distraction-free viewer. Free, forever.',
  keywords: ['writing', 'blog', 'publishing', 'markdown', 'reading'],
  authors: [{ name: 'Folio' }],
  openGraph: {
    type: 'website',
    siteName: 'Folio',
    title: 'Folio — publish and read, free',
    description: 'A fast, free home for writing. Markdown in, beautiful reading experience out.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Folio — publish and read, free',
    description: 'A fast, free home for writing.',
  },
  robots: { index: true, follow: true },
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
  width: 'device-width',
  initialScale: 1,
};

/**
 * Applies the saved theme before first paint so there is no white flash for
 * dark-mode readers. Inline (not a module) so it runs before any CSS or JS
 * bundle is evaluated.
 */
const themeBootstrap = `(function(){try{
  var m=document.cookie.match(/(?:^|; )folio_theme=([^;]*)/);
  var t=(m&&m[1])||(window.localStorage&&localStorage.getItem('folio-theme'))||'system';
  var d=t==='dark'||(t!=='light'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  var e=document.documentElement;
  if(d)e.classList.add('dark');
  e.style.colorScheme=d?'dark':'light';
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="flex min-h-dvh flex-col bg-bg text-ink antialiased">
        <ThemeProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg"
          >
            Skip to content
          </a>
          <Header />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
