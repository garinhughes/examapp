import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import mermaid from 'mermaid'
import { ensureCloudIconPacks, detectProviders } from '@/lib/cloudIconPacks'

let mermaidTheme: string | null = null

function ensureViewBox(svgStr: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgStr, 'image/svg+xml')
  const el = doc.querySelector('svg')
  if (!el) return svgStr
  if (!el.getAttribute('viewBox')) {
    const w = parseFloat((el.getAttribute('width') ?? '0').replace(/px$/, ''))
    const h = parseFloat((el.getAttribute('height') ?? '0').replace(/px$/, ''))
    if (w > 0 && h > 0) el.setAttribute('viewBox', `0 0 ${w} ${h}`)
  }
  el.setAttribute('width', '100%')
  el.removeAttribute('height')
  el.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  return new XMLSerializer().serializeToString(el)
}

interface LabDiagramProps {
  code: string
  idHint?: string
  className?: string
}

export function LabDiagram({ code, idHint = 'lab', className = '' }: LabDiagramProps) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const renderIdRef = useRef(0)
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function render() {
      if (!code?.trim()) { setSvg(null); return }
      const providers = detectProviders(code)
      await ensureCloudIconPacks(providers)
      if (cancelled) return

      const mTheme = isDark ? 'dark' : 'default'
      if (mermaidTheme !== mTheme) {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: mTheme })
        mermaidTheme = mTheme
      }

      const id = ++renderIdRef.current
      const uniqueId = `lab-diagram-${idHint.replace(/[^a-z0-9]/gi, '-')}-${id}`
      try {
        const { svg: rendered } = await mermaid.render(uniqueId, code)
        if (!cancelled) { setSvg(ensureViewBox(rendered)); setError(null) }
      } catch (e: any) {
        if (!cancelled) { setSvg(null); setError(e?.message ?? String(e)) }
      }
    }
    render().catch(() => {})
    return () => { cancelled = true }
  }, [code, idHint, isDark])

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, close])

  if (error) {
    return (
      <div className={`rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive font-mono whitespace-pre-wrap ${className}`}>
        Diagram failed to render: {error}
      </div>
    )
  }
  if (!svg) return null

  return (
    <>
      <div className={className}>
        <div
          className="w-full rounded-lg border border-border bg-card p-4 cursor-zoom-in overflow-hidden [&_svg]:w-full [&_svg]:h-auto"
          onClick={() => setOpen(true)}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="text-xs text-muted-foreground mt-1 text-center">Click to enlarge</p>
      </div>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4"
          onClick={close}
        >
          <button
            onClick={close}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <div
            className="max-w-full max-h-[90vh] overflow-auto rounded-lg bg-card p-6 [&_svg]:w-full [&_svg]:h-auto"
            style={{ minWidth: 'min(90vw, 800px)' }}
            onClick={e => e.stopPropagation()}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>,
        document.body,
      )}
    </>
  )
}
