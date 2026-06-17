import type { Metadata } from "next";
import { Geist_Mono, DM_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import PublicPixels from "@/components/analytics/PublicPixels";

// DM Sans — primary brand font (FoCar redesign). Self-hosted by Next
// via next/font/google, so no external Google Fonts request at runtime
// and no FOUT flash.
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
        {/* Marketing pixels — public funnel routes only (excludes /dashboard). */}
        <PublicPixels />
      </body>
    </html>
  );
}
