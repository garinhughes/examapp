import React, { useState } from 'react'

export function ScoreHistoryChart({ data, passMark, showEmptyText }: { data: any[]; passMark: number; showEmptyText?: boolean }) {
  const w = 560
  const h = 140
  const padL = 36
  const padR = 16
  const padT = 18
  const padB = 26
  const innerW = w - padL - padR
  const innerH = h - padT - padB

  const clampPct = (n: any) => {
    const v = Number(n)
    if (!Number.isFinite(v)) return 0
    return Math.max(0, Math.min(100, v))
  }
  const toY = (pct: number) => padT + (1 - (pct / 100)) * innerH
  const toX = (i: number, n: number) => padL + (i / Math.max(1, n - 1)) * innerW

  const normalized = Array.isArray(data)
    ? data.map((d) => {
      const pct = clampPct(d.score)
      const correctCount = (d.correctCount === null || d.correctCount === undefined) ? null : Number(d.correctCount)
      const total = (d.total === null || d.total === undefined) ? null : Number(d.total)
      return { ...d, pct, correctCount: Number.isFinite(correctCount as any) ? correctCount : null, total: Number.isFinite(total as any) ? total : null }
    })
    : []

  const points = normalized.map((d, i) => {
    const x = toX(i, normalized.length)
    const y = toY(d.pct)
    return { x, y, d }
  })

  const [activeIdx, setActiveIdx] = useState<number | null>(null)

  const passY = toY(clampPct(passMark))
  const empty = normalized.length === 0
  if (empty && showEmptyText) {
    return <div className="text-sm text-muted-foreground">No finished scores yet</div>
  }

  const dateLabel = (v: any) => {
    try { return new Date(v).toLocaleDateString() } catch { return '—' }
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="rounded">
      <rect x={0} y={0} width={w} height={h} fill="transparent" />

      {/* grid */}
      <g stroke="#334155" strokeOpacity="0.12">
        <line x1={padL} x2={w - padR} y1={padT} y2={padT} />
        <line x1={padL} x2={w - padR} y1={padT + innerH / 2} y2={padT + innerH / 2} />
        <line x1={padL} x2={w - padR} y1={padT + innerH} y2={padT + innerH} />
      </g>

      {/* pass mark */}
      <g>
        <line x1={padL} x2={w - padR} y1={passY} y2={passY} stroke="var(--color-correct-2)" strokeOpacity="0.55" strokeWidth={1.5} strokeDasharray="5 4" />
        <text x={w - padR} y={passY - 4} fontSize={10} fill="var(--color-correct-2)" textAnchor="end">Pass {clampPct(passMark)}%</text>
      </g>

      {/* series */}
      {points.length > 1 && (
        <g fill="none" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
          {points.slice(0, -1).map((p, i) => {
            const n = points[i + 1]
            const pPass = p.d.pct >= clampPct(passMark)
            const nPass = n.d.pct >= clampPct(passMark)
            const stroke = (pPass && nPass) ? 'var(--color-correct)' : (!pPass && !nPass) ? 'var(--color-incorrect)' : 'rgba(148,163,184,0.8)'
            return <line key={i} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke={stroke} />
          })}
        </g>
      )}

      {/* points */}
      <g>
        {points.map((p, i) => {
          const pass = p.d.pct >= clampPct(passMark)
          const fill = pass ? 'var(--color-correct)' : 'var(--color-incorrect)'
          const outline = pass ? 'var(--color-correct-2)' : 'var(--color-incorrect-2)'
          const when = p.d.finishedAt || p.d.startedAt
          const ratio = (typeof p.d.correctCount === 'number' && typeof p.d.total === 'number') ? `${p.d.correctCount}/${p.d.total}` : null
          return (
            <g key={p.d.attemptId || i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={6}
                fill={fill}
                stroke={outline}
                strokeWidth={1}
                style={{ cursor: 'pointer' }}
                onClick={(ev: any) => { ev.stopPropagation(); setActiveIdx(i === activeIdx ? null : i) }}
                onTouchStart={(ev: any) => { ev.stopPropagation(); setActiveIdx(i === activeIdx ? null : i) }}
              />
              <title>{`${when ? new Date(when).toLocaleString() : '—'} ${p.d.pct}%${ratio ? ` (${ratio})` : ''}`}</title>
            </g>
          )
        })}
      </g>

      {/* axis labels */}
      <text x={padL} y={h - 8} fontSize={10} fill="#94a3b8">{points[0]?.d ? dateLabel(points[0].d.finishedAt || points[0].d.startedAt) : ''}</text>
      <text x={w - padR} y={h - 8} fontSize={10} fill="#94a3b8" textAnchor="end">{points[points.length - 1]?.d ? dateLabel(points[points.length - 1].d.finishedAt || points[points.length - 1].d.startedAt) : ''}</text>

      {/* tooltip for active point (mobile tap) */}
      {activeIdx !== null && points[activeIdx] && (
        (() => {
          const p = points[activeIdx]
          const tx = Math.min(w - padR - 8, Math.max(padL + 8, p.x + 8))
          const ty = Math.max(padT + 8, p.y - 28)
          const when = p.d.finishedAt || p.d.startedAt
          const ratio = (typeof p.d.correctCount === 'number' && typeof p.d.total === 'number') ? `${p.d.correctCount}/${p.d.total}` : null
          const lines = [`${p.d.pct}%${ratio ? ` (${ratio})` : ''}`, when ? new Date(when).toLocaleString() : '—']
          return (
            <g>
              <rect x={tx - 6} y={ty - 18} rx={6} ry={6} width={140} height={36} fill="#0f172a" stroke="#475569" strokeWidth={0.5} opacity={0.95} />
              <text x={tx + 4} y={ty - 2} fontSize={11} fill="#e2e8f0">{lines[0]}</text>
              <text x={tx + 4} y={ty + 12} fontSize={9} fill="#94a3b8">{lines[1]}</text>
            </g>
          )
        })()
      )}
    </svg>
  )
}
