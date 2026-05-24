'use client'
// ─────────────────────────────────────────────────────────────────────
// ContactButtons — shared Call + Message popovers for a phone number.
// ─────────────────────────────────────────────────────────────────────
// Call popover: "Appel téléphonique" (tel:) + "Appel WhatsApp" (wa.me).
// Message popover: "SMS" (sms:) + "WhatsApp" (wa.me).
// Self-contained: per-instance open state + outside-click (mousedown) close,
// so it drops into any list row (prospects, contracts, …). Phone is parsed
// with rentalFormatPhoneIntl; buttons disable when there's no usable number.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { Phone, MessageSquare, MessageCircle } from 'lucide-react'
import { rentalFormatPhoneIntl } from '@/lib/rental/prospects'

export default function ContactButtons({ phone }: { phone: string | null | undefined }) {
  const intl = rentalFormatPhoneIntl(phone)
  const has = !!intl
  const [open, setOpen] = useState<'call' | 'msg' | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close this instance's popover when clicking outside its root (clicking
  // another row's buttons is "outside" here, so only one stays open).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const btnCls = 'w-8 h-8 rounded-full inline-flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const menuCls = 'absolute end-0 top-full mt-2 z-30 w-52 rounded-xl border py-1 text-start shadow-2xl'
  const menuStyle = { background: 'var(--bg-surface)', borderColor: 'var(--border)' } as const
  const itemCls = 'flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--bg-elevated)]'
  const btnStyle = { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' } as const

  return (
    <div ref={rootRef} className="inline-flex items-center gap-2">
      {/* Call */}
      <div className="relative">
        <button
          type="button"
          disabled={!has}
          onClick={() => setOpen((c) => (c === 'call' ? null : 'call'))}
          aria-haspopup="menu"
          aria-expanded={open === 'call'}
          title={has ? `Appeler ${phone}` : 'Pas de numéro'}
          className={btnCls}
          style={btnStyle}
        >
          <Phone className="w-4 h-4" />
        </button>
        {has && open === 'call' && (
          <div role="menu" className={menuCls} style={menuStyle}>
            <a href={`tel:${intl!.tel}`} onClick={() => setOpen(null)} className={itemCls} style={{ color: 'var(--text-primary)' }}>
              <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Appel téléphonique
            </a>
            <a href={`https://wa.me/${intl!.wa}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(null)} className={itemCls} style={{ color: 'var(--text-primary)' }}>
              <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Appel WhatsApp
            </a>
          </div>
        )}
      </div>

      {/* Message */}
      <div className="relative">
        <button
          type="button"
          disabled={!has}
          onClick={() => setOpen((c) => (c === 'msg' ? null : 'msg'))}
          aria-haspopup="menu"
          aria-expanded={open === 'msg'}
          title={has ? `Message à ${phone}` : 'Pas de numéro'}
          className={btnCls}
          style={btnStyle}
        >
          <MessageSquare className="w-4 h-4" />
        </button>
        {has && open === 'msg' && (
          <div role="menu" className={menuCls} style={menuStyle}>
            <a href={`sms:${intl!.tel}`} onClick={() => setOpen(null)} className={itemCls} style={{ color: 'var(--text-primary)' }}>
              <MessageSquare className="w-4 h-4 text-sky-600 dark:text-sky-400" /> SMS
            </a>
            <a href={`https://wa.me/${intl!.wa}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(null)} className={itemCls} style={{ color: 'var(--text-primary)' }}>
              <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> WhatsApp
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
