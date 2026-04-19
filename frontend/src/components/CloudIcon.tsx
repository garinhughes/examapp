import { useState, useEffect } from 'react'
import { Box } from 'lucide-react'
import { apiUrl } from '@/apiBase'
import { CLOUD_ICON_KEYS } from '@/lib/cloudIcons'

interface Props {
  name: string
  className?: string
  alt?: string
}

export function CloudIcon({ name, className, alt }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const key = CLOUD_ICON_KEYS[name]

  useEffect(() => {
    if (!key) return
    let cancelled = false
    fetch(apiUrl(`/images/presigned?key=${encodeURIComponent(key)}`))
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled && data?.url) setSrc(data.url) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [key])

  if (!key || !src) {
    return (
      <span
        aria-label={name}
        className={`inline-flex items-center justify-center rounded bg-orange-500 text-white shrink-0 ${className ?? 'w-7 h-7'}`}
      >
        <Box className="w-3.5 h-3.5" />
      </span>
    )
  }

  return (
    <img
      src={src}
      alt={alt ?? name}
      className={`rounded ${className ?? ''}`}
      loading="lazy"
    />
  )
}
