import type { Metadata } from "next";
import Script from "next/script";
import { Geist_Mono, DM_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

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

// ── Marketing pixel snippets ────────────────────────────────────────
// Loaded via next/script with `afterInteractive`. Each one only mounts
// when its env var is set, so previews / dev / sites without ad
// accounts don't ship a 404'ing snippet.
const META_PIXEL_ID    = process.env.NEXT_PUBLIC_META_PIXEL_ID
const TIKTOK_PIXEL_ID  = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID

const metaPixelSnippet = META_PIXEL_ID
  ? `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`
  : null

const tiktokPixelSnippet = TIKTOK_PIXEL_ID
  ? `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var i=document.createElement("script");i.type="text/javascript",i.async=!0,i.src=r+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(i,a)};ttq.load('${TIKTOK_PIXEL_ID}');ttq.page();}(window,document,'ttq');`
  : null

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${dmSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <meta name="facebook-domain-verification" content="k0sj47yiz1pmpqoezq4iqzi0n0q5w2" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <script dangerouslySetInnerHTML={{ __html: localeBootstrap }} />
      </head>
      <body className="h-full">
        <ThemeProvider>{children}</ThemeProvider>
        {/* Pixels: load after the page is interactive — don't block FCP. */}
        {metaPixelSnippet && (
          <Script id="meta-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: metaPixelSnippet }} />
        )}
        {tiktokPixelSnippet && (
          <Script id="tiktok-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: tiktokPixelSnippet }} />
        )}
        {/* <noscript> fallback for Meta — just shows a 1x1 image. */}
        {META_PIXEL_ID && (
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              alt=""
              src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            />
          </noscript>
        )}
      </body>
    </html>
  );
}
