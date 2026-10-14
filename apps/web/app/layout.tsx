import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { DM_Sans, Inter, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

// DM Sans carries the display voice: geometric, and quiet enough to sit at the
// large sizes and light weights the type scale now uses. Space Grotesk's quirk
// fought the airiness those sizes depend on.
const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-display-family',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Software Engineering Face-Off',
    template: '%s · Face-Off',
  },
  description: 'Learn. Build. Compete. Prove your engineering skills.',
  // Served from apps/web/public/, so the URL is /icon.png — `public` never
  // appears in the path. A path of /public/icon.png 404s.
  icons: '/icon.png',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f6fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1020' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Set per request by middleware.ts. Reading headers here makes every page
  // dynamic, which costs nothing: each one is an auth-gated client shell.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html
      lang="en"
      // Dark is the default so server-rendered markup has a definite theme; the
      // script below corrects it before paint if the visitor prefers otherwise.
      data-theme="dark"
      className={`${dmSans.variable} ${inter.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Runs before first paint, so a light-mode visitor never sees a dark flash.
          It has to be inline and blocking: any deferred script, including React
          hydration, happens after the browser has already painted.

          Kept deliberately tiny and dependency-free, and mirrors resolve() in
          components/theme-toggle.tsx — if one changes, so must the other.
        */}
        <script
          nonce={nonce}
          // Browsers blank the nonce attribute after parsing so page scripts
          // cannot read it (only the IDL property keeps it). React then sees
          // nonce="" on the client against the server's value and reports a
          // mismatch. The script has already run by that point; the difference
          // is expected and carries no consequence.
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('faceoff-theme')||'system';var d=t==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):t;document.documentElement.dataset.theme=d}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
