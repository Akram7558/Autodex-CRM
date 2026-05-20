'use client'
// ─────────────────────────────────────────────────────────────────────
// VehiclePhotoUploader — multi-photo grid for rental_vehicles.photos_urls.
// ─────────────────────────────────────────────────────────────────────
// Stores STORAGE PATHS (not public URLs) on the row. Reads resolve to
// 1-hour signed URLs via `getSignedReadUrl`. Supports:
//   • multi-file selection (parallel uploads)
//   • per-slot remove
//   • HTML5 drag-and-drop reorder (no extra dependency)
//   • inline upload spinner per pending file
//   • 5 MB / jpg|png|webp validation
//
// First path in the array = main photo (small "Photo principale"
// badge). Reordering is purely a client-side state op until the
// caller submits the form.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2, Star, Trash2 } from 'lucide-react'
import {
  extOf, getSignedReadUrl, MAX_UPLOAD_BYTES, uploadViaSignedUrl, validatePhotoFile,
} from '@/lib/rental/storage'

type Props = {
  value:        string[]
  onChange:     (paths: string[]) => void
  vehicleId?:   string | null
  maxPhotos?:   number
}

type Pending = { id: string; localUrl: string }

const ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp'

export default function VehiclePhotoUploader({
  value, onChange, vehicleId, maxPhotos = 10,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending[]>([])
  const [error, setError]     = useState<string | null>(null)

  // Resolved signed read URLs for `value` — keyed by path so we
  // don't refetch on every reorder.
  const [urlMap, setUrlMap] = useState<Record<string, string | null>>({})
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const missing = value.filter((p) => !(p in urlMap))
      if (missing.length === 0) return
      const entries = await Promise.all(
        missing.map(async (p) => [p, await getSignedReadUrl(p)] as const),
      )
      if (cancelled) return
      setUrlMap((prev) => {
        const next = { ...prev }
        for (const [p, u] of entries) next[p] = u
        return next
      })
    })()
    return () => { cancelled = true }
  }, [value, urlMap])

  // ── Upload flow ─────────────────────────────────────────────
  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    // `input.files` is a *live* FileList: resetting `input.value` below
    // empties that same object. Snapshot to a plain array FIRST, then
    // clear the input — otherwise the captured list reads zero files and
    // the whole upload silently no-ops (counter stays 0, no request).
    const picked = input.files ? Array.from(input.files) : []
    input.value = ''
    if (picked.length === 0) return
    setError(null)

    const room = maxPhotos - value.length - pending.length
    if (room <= 0) {
      setError('Limite atteinte.')
      return
    }
    const files = picked.slice(0, room)

    // Validate up-front; reject the whole batch on any failure so the
    // user can fix and retry.
    for (const f of files) {
      const v = validatePhotoFile(f)
      if (v) {
        setError(
          v === 'rental.upload.error_size'
            ? 'Fichier trop volumineux (max 5 Mo).'
            : 'Format non supporté (jpg, png, webp).',
        )
        return
      }
    }

    // Optimistically slot each file into `pending` with a local URL
    // so the grid shows blurred previews while the network round-trip
    // resolves.
    const items: Pending[] = files.map((f) => ({
      id: crypto.randomUUID(),
      localUrl: URL.createObjectURL(f),
    }))
    setPending((cur) => [...cur, ...items])

    try {
      const baseSlot = value.length + 1
      const results = await Promise.allSettled(
        files.map((f, i) =>
          uploadViaSignedUrl(f, {
            kind: 'vehicle_photo',
            vehicle_id: vehicleId ?? null,
            slot: baseSlot + i,
            file_ext: extOf(f) || 'jpg',
          }),
        ),
      )

      const newPaths: string[] = []
      let firstFailure: string | null = null
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          newPaths.push(r.value)
        } else if (!firstFailure) {
          firstFailure = r.reason instanceof Error ? r.reason.message : 'upload_failed'
          console.error('[VehiclePhotoUploader] upload failed:', r.reason)
        }
        // Release the blob URL — preview is replaced by the signed read.
        URL.revokeObjectURL(items[i].localUrl)
      })

      if (newPaths.length > 0) onChange([...value, ...newPaths])
      // Surface the real server message (e.g. "Aucun showroom associé…",
      // "Format de fichier non autorisé") instead of a generic blurb.
      if (firstFailure) setError(`Échec du téléversement : ${firstFailure}`)
    } catch (err) {
      // Defensive: anything that escapes the per-file settle surfaces
      // here rather than dying as an unhandled rejection.
      console.error('[VehiclePhotoUploader] unexpected upload error:', err)
      for (const it of items) URL.revokeObjectURL(it.localUrl)
      setError(err instanceof Error ? err.message : 'Échec du téléversement. Réessayez.')
    } finally {
      // Always clear this batch's optimistic pending slots.
      setPending((cur) => cur.filter((p) => !items.some((it) => it.id === p.id)))
    }
  }

  function removeAt(idx: number) {
    const next = value.slice()
    next.splice(idx, 1)
    onChange(next)
  }

  // ── Drag-and-drop reorder (HTML5 native) ─────────────────────
  const dragIndex = useRef<number | null>(null)
  function onDragStart(idx: number) { dragIndex.current = idx }
  function onDragOver(e: React.DragEvent) { e.preventDefault() }
  function onDrop(targetIdx: number) {
    const from = dragIndex.current
    dragIndex.current = null
    if (from == null || from === targetIdx) return
    const next = value.slice()
    const [moved] = next.splice(from, 1)
    next.splice(targetIdx, 0, moved)
    onChange(next)
  }

  const remainingSlots = Math.max(0, maxPhotos - value.length - pending.length)
  const canAddMore = remainingSlots > 0

  return (
    <div>
      {/* Visually hidden but kept in layout flow (`sr-only`, NOT
          `display:none`). A display:none file input opens the picker on a
          programmatic .click() yet some engines (Safari/WebKit) then drop
          the `change` event entirely — so onChange never fires and the
          upload silently no-ops. sr-only keeps it rendered so change
          fires reliably across browsers. */}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={onFiles}
        className="sr-only"
        tabIndex={-1}
        aria-label="Ajouter des photos"
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* Existing photos */}
        {value.map((path, i) => (
          <PhotoCard
            key={path}
            url={urlMap[path] ?? null}
            main={i === 0}
            draggable
            onDragStart={() => onDragStart(i)}
            onDragOver={onDragOver}
            onDrop={() => onDrop(i)}
            onRemove={() => removeAt(i)}
          />
        ))}
        {/* Pending uploads */}
        {pending.map((p) => (
          <PhotoCard key={p.id} url={p.localUrl} uploading />
        ))}
        {/* Add slot */}
        {canAddMore && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="aspect-square rounded-xl flex flex-col items-center justify-center gap-1.5 transition-colors duration-150"
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
            aria-label="Ajouter des photos"
          >
            <Camera className="w-6 h-6" />
            <span className="text-[11px] font-semibold">Ajouter</span>
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span style={{ color: 'var(--text-muted)' }}>
          <bdi className="tabular-nums">{value.length + pending.length}</bdi> /{' '}
          <bdi className="tabular-nums">{maxPhotos}</bdi> photos
          {value.length > 1 && (
            <span className="ms-3 hidden sm:inline">· Glissez pour réorganiser</span>
          )}
        </span>
        {error && (
          <span className="font-medium" style={{ color: '#fb7185' }}>
            {error}
          </span>
        )}
      </div>

      <p className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
        JPG, PNG ou WebP — {Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} Mo max par photo.
      </p>
    </div>
  )
}

// ─── Photo card ────────────────────────────────────────────────────

function PhotoCard({
  url, main, uploading, draggable, onRemove, onDragStart, onDragOver, onDrop,
}: {
  url:          string | null
  main?:        boolean
  uploading?:   boolean
  draggable?:   boolean
  onRemove?:    () => void
  onDragStart?: () => void
  onDragOver?:  (e: React.DragEvent) => void
  onDrop?:      () => void
}) {
  return (
    <div
      className="relative aspect-square rounded-xl overflow-hidden group cursor-move"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
          <Camera className="w-7 h-7 opacity-50" />
        </div>
      )}

      {uploading && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-white" />
        </div>
      )}

      {main && !uploading && (
        <span
          className="absolute top-2 start-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
          style={{
            background: 'rgba(16,185,129,0.92)',
            color: '#fff',
            boxShadow: '0 4px 14px rgba(16,185,129,0.35)',
          }}
        >
          <Star className="w-2.5 h-2.5 fill-current" />
          Principale
        </span>
      )}

      {onRemove && !uploading && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2 end-2 w-7 h-7 rounded-md inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          style={{
            background: 'rgba(15, 15, 18, 0.75)',
            backdropFilter: 'blur(8px)',
            color: '#fff',
          }}
          aria-label="Supprimer cette photo"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(244,63,94,0.92)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(15, 15, 18, 0.75)' }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
