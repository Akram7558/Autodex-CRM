'use client'
// ─────────────────────────────────────────────────────────────────────
// DocumentUploader — drop-zone for a single CIN or permis document.
// ─────────────────────────────────────────────────────────────────────
// Flow:
//   1. user clicks → file picker
//   2. validate size + format
//   3. POST /api/rental/uploads/sign → { upload_url, path }
//   4. PUT file to upload_url
//   5. onChange(path) so the parent persists the storage path on
//      the customer row
//
// The component does NOT render the image preview from `value` —
// the bucket is private and needs a signed read URL. The parent
// page is in charge of resolving signed URLs when displaying.
// During the upload session we keep a local createObjectURL preview.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { Camera, FileText, Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Kind = 'cin' | 'permis'

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'

export default function DocumentUploader({
  kind, value, customerId, onChange,
}: {
  kind:        Kind
  value:       string | null
  customerId?: string | null     // pass when editing an existing customer
  onChange:    (path: string | null) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [uploading,    setUploading]    = useState(false)
  const [progress,     setProgress]     = useState(0)
  const [error,        setError]        = useState<string | null>(null)

  // Clean up any object-URL we created so we don't leak.
  useEffect(() => {
    return () => {
      if (localPreview && localPreview.startsWith('blob:')) {
        URL.revokeObjectURL(localPreview)
      }
    }
  }, [localPreview])

  function pick() { fileRef.current?.click() }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)

    if (file.size > MAX_BYTES) {
      setError('Fichier trop volumineux (max 5 Mo).')
      return
    }
    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    if (!['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext)) {
      setError('Format non supporté (jpg, png, webp ou pdf).')
      return
    }

    // Local preview while we upload.
    const blob = URL.createObjectURL(file)
    setLocalPreview(blob)
    setUploading(true)
    setProgress(0)

    try {
      // 1. Ask the server for a signed upload URL.
      const signRes = await fetch('/api/rental/uploads/sign', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ kind, customer_id: customerId ?? null, file_ext: ext }),
      })
      const sign = await signRes.json().catch(() => ({}))
      if (!signRes.ok) throw new Error(sign?.error ?? 'sign_failed')

      // 2. PUT to the bucket. We use the supabase-js helper so we
      //    don't have to hand-roll the Authorization header, but a
      //    plain fetch PUT would work too.
      const upload = await supabase.storage
        .from('rental-documents')
        .uploadToSignedUrl(sign.path, sign.token, file, {
          contentType: file.type || undefined,
          upsert: true,
        })
      if (upload.error) throw new Error(upload.error.message)

      setProgress(100)
      onChange(sign.path)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'upload_failed'
      setError(msg)
      setLocalPreview(null)
    } finally {
      setUploading(false)
    }
  }

  function clear() {
    setLocalPreview(null)
    onChange(null)
  }

  const hasFile = !!value || !!localPreview
  const label = kind === 'cin' ? 'CIN' : 'Permis'

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        onChange={onFile}
        className="hidden"
        aria-label={`Téléverser ${label}`}
      />

      {!hasFile ? (
        <button
          type="button"
          onClick={pick}
          className="w-full rounded-xl p-5 flex flex-col items-center gap-2 transition-colors duration-150 ease-out"
          style={{
            background: 'var(--bg-elevated)',
            border: '1.5px dashed var(--border-strong)',
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 45%, transparent)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-strong)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
        >
          <Camera className="w-5 h-5" />
          <span className="text-xs font-semibold">Cliquer pour téléverser le {label}</span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            JPG, PNG, WebP, PDF — 5 Mo max
          </span>
        </button>
      ) : (
        <div
          className="relative rounded-xl overflow-hidden"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
          }}
        >
          {localPreview && !localPreview.toLowerCase().endsWith('.pdf') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={localPreview}
              alt={label}
              className="w-full h-40 object-cover"
            />
          ) : (
            <div className="w-full h-40 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
              <FileText className="w-10 h-10" />
            </div>
          )}

          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
              <Loader2 className="w-6 h-6 animate-spin text-white" />
            </div>
          )}

          <div className="px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {label} · téléversé
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={pick}
                className="px-2 py-1 rounded-md text-xs font-medium transition-colors"
                style={{ color: 'var(--accent)' }}
              >
                Remplacer
              </button>
              <button
                type="button"
                onClick={clear}
                className="w-7 h-7 rounded-md inline-flex items-center justify-center hover:bg-rose-500/10 text-zinc-500 hover:text-rose-500"
                aria-label="Retirer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Stripe progress bar */}
          {uploading && (
            <div className="absolute bottom-0 inset-x-0 h-0.5 bg-black/20 overflow-hidden">
              <div
                className="h-full transition-[width] duration-200"
                style={{ width: `${progress}%`, background: 'var(--accent)' }}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs" style={{ color: '#fb7185' }}>{error}</p>
      )}
    </div>
  )
}
