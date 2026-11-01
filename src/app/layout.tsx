import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import PublicPixels from "@/components/analytics/PublicPixels";
import AttributionCapture from "@/components/analytics/AttributionCapture";

// Fonts are self-hosted from src/app/fonts (OFL, licenses alongside) so the
// build never fetches Google Fonts — a Google Fonts hiccup used to fail
// production deploys. Each file is the upstream variable font subset to
// latin + latin-ext, keeping the wght axis.

// DM Sans — primary brand font (FoCar redesign). Pinned to opsz=14 and
// declared as 400–700, matching what the Google Fonts loader used to serve.
const dmSans = localFont({
  src: "./fonts/DMSans-Variable.woff2",
  weight: "400 700",
  style: "normal",
  variable: "--font-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-geist-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Autodex — Gestion automobile Algérie",
  description: "CRM commercial automobile pour showrooms en Algérie",
};

// Blocking inline script — sets the resolved theme on <html> BEFORE
// hydration to avoid FOUC. Writes BOTH:
//   • the legacy `.dark` class (existing dashboard CSS depends on it)
//   • the new `data-theme` attribute (landing CSS variables read it)
const themeBootstrap = `(function(){try{var k='autodex-theme';var s=localStorage.getItem(k);var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=s==='dark'||((s==null||s==='system')&&m);var r=document.documentElement;r.setAttribute('data-theme',d?'dark':'light');if(d){r.classList.add('dark');}else{r.classList.remove('dark');}}catch(e){document.documentElement.setAttribute('data-theme','dark');document.documentElement.classList.add('dark');}})();`;

// Locale bootstrap — sets lang + dir on <html> before paint so the
// landing's RTL switch doesn't flash.
const localeBootstrap = `(function(){try{var l=localStorage.getItem('autodex-locale')||'fr';document.documentElement.setAttribute('lang',l);document.documentElement.setAttribute('dir',l==='ar'?'rtl':'ltr');}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${dmSans.variable} ${geistMono.variable} h-full antialiased scroll-smooth`}
      suppressHydrationWarning
    >
      <head>
        <meta name="facebook-domain-verification" content="k0sj47yiz1pmpqoezq4iqzi0n0q5w2" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <script dangerouslySetInnerHTML={{ __html: localeBootstrap }} />
      </head>
      <body className="h-full">
        <ThemeProvider>{children}</ThemeProvider>
        {/* First-touch acquisition attribution (cookie, app-wide). */}
        <AttributionCapture />
        {/* Marketing pixels — public funnel routes only (excludes /dashboard). */}
        <PublicPixels />
      </body>
    </html>
  );
}
