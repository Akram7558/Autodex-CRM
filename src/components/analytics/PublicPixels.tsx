'use client'
// ─────────────────────────────────────────────────────────────────────
// PublicPixels — Meta + TikTok pixel base code, scoped to PUBLIC routes.
// ─────────────────────────────────────────────────────────────────────
// This markup previously lived inline in the root layout, so PageView fired
// on EVERY route — including the authenticated /dashboard/*. It now renders
// ONLY on public funnel pages (everything NOT under /dashboard, which is the
// sole authenticated area per middleware matcher '/dashboard/:path*').
//
// Same env-gating as before: each pixel mounts only when its
// NEXT_PUBLIC_*_PIXEL_ID is set (inlined at build for client components), so
// dev/preview without ad accounts ship nothing. strategy="afterInteractive"
// keeps it off the FCP path. The site-wide facebook-domain-verification meta
// tag stays in the layout <head> — it is NOT here.
// ─────────────────────────────────────────────────────────────────────

import Script from 'next/script'
import { usePathname } from 'next/navigation'

const META_PIXEL_ID    = process.env.NEXT_PUBLIC_META_PIXEL_ID
const TIKTOK_PIXEL_ID  = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID

const metaPixelSnippet = META_PIXEL_ID
  ? `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`
  : null

const tiktokPixelSnippet = TIKTOK_PIXEL_ID
  ? `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var i=document.createElement("script");i.type="text/javascript",i.async=!0,i.src=r+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(i,a)};ttq.load('${TIKTOK_PIXEL_ID}');ttq.page();}(window,document,'ttq');`
  : null

// The ONLY authenticated area is /dashboard/* (middleware matcher
// '/dashboard/:path*'). Everything else (/, /register, /login, /s/[slug],
// /privacy, /terms, /reset-password) is a public funnel page → keep pixels.
function isPublicPath(pathname: string): boolean {
  return !pathname.startsWith('/dashboard')
}

export default function PublicPixels() {
  const pathname = usePathname()
  if (!isPublicPath(pathname)) return null

  return (
    <>
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
    </>
  )
}
