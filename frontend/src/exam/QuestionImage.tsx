import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { apiUrl } from '@/apiBase'

export function QuestionImage({ imageKey }: { imageKey: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch(apiUrl(`/images/presigned?key=${encodeURIComponent(imageKey)}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.url && setSrc(data.url))
      .catch(() => {})
  }, [imageKey])

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, close])

  if (!src) return null

  return (
    <>
      <div className="mt-3">
        <img
          src={src}
          alt="Question diagram"
          className="w-full max-h-72 object-contain rounded-lg border border-border cursor-zoom-in bg-white/5"
          onClick={() => setOpen(true)}
        />
        <p className="text-xs text-muted-foreground mt-1 text-center">Click to enlarge</p>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={close}
        >
          <button
            onClick={close}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={src}
            alt="Question diagram"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
