import { useState, useCallback, useEffect } from 'react'
import { useExam } from '@/exam/ExamContext'
import type { ConfigToggleLabDefinition, ConfigItem, ConfigVisualZone } from '../../types'
import { LabHeader } from '../LabHeader'
import { ExplanationBlock } from '../ExplanationBlock'
import { useLabSession } from '../useLabSession'
import { LabCompleteModal } from '../LabCompleteModal'

interface ConfigToggleProgress { values: Record<string, string>; timeLeft: number }

interface Props {
  lab: ConfigToggleLabDefinition
  timed?: boolean
}

const ZONE_COLORS: Record<string, { border: string; bg: string }> = {
  blue:    { border: 'border-blue-400/60 dark:border-blue-500/40',    bg: 'bg-blue-50/50 dark:bg-blue-900/10' },
  orange:  { border: 'border-amber-400/60 dark:border-amber-500/40',  bg: 'bg-amber-50/50 dark:bg-amber-900/10' },
  green:   { border: 'border-green-400/60 dark:border-green-500/40',  bg: 'bg-green-50/50 dark:bg-green-900/10' },
  neutral: { border: 'border-border/60',                              bg: 'bg-muted/20' },
}

export function ConfigToggleRunner({ lab, timed = true }: Props) {
  const { setRoute } = useExam()
  const session = useLabSession<ConfigToggleProgress>({ lab, timed })

  const [values, setValues] = useState<Record<string, string>>(() => {
    if (session.savedProgress?.values) return session.savedProgress.values
    const init: Record<string, string> = {}
    for (const item of lab.configItems) init[item.id] = item.currentValue
    return init
  })
  const [results, setResults] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ values, timeLeft: session.timeLeft })
  }, [values, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !session.submitted) doSubmit()
  }, [session.timeLeft])

  const updateValue = useCallback((id: string, value: string) => {
    if (session.submitted) return
    setValues((prev) => ({ ...prev, [id]: value }))
  }, [session.submitted])

  const doSubmit = useCallback(async () => {
    const res: Record<string, boolean> = {}
    let allCorrect = true
    for (const item of lab.configItems) {
      const pass = values[item.id]?.trim() === item.correctValue.trim()
      res[item.id] = pass
      if (!pass) allCorrect = false
    }
    setResults(res)
    await session.finalize(allCorrect, JSON.stringify(values))
  }, [lab, values, session.finalize])

  const allCorrect = session.submitted && lab.configItems.every((item) => results[item.id])

  function renderItem(item: ConfigItem, compact = false) {
    const displayLabel = compact && item.shortLabel ? item.shortLabel : item.label
    const labelClass = compact ? 'block text-xs font-medium mb-1' : 'block text-sm font-medium mb-1'
    return (
      <div key={item.id} className={compact ? 'space-y-0.5' : undefined}>
        <label className={labelClass}>
          {displayLabel}
          {session.submitted && (
            <span className={`ml-2 text-xs font-bold ${results[item.id] ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {results[item.id] ? '✓' : '✗'}
            </span>
          )}
        </label>
        {item.inputType === 'select' && item.options ? (
          <select
            value={values[item.id] || ''}
            onChange={(e) => updateValue(item.id, e.target.value)}
            disabled={session.submitted}
            className={`w-full px-2 py-1.5 rounded-md border text-sm bg-card focus:outline-none focus:ring-1 focus:ring-primary ${
              session.submitted
                ? results[item.id] ? 'border-green-500' : 'border-destructive'
                : 'border-border'
            }`}
          >
            {item.options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={values[item.id] || ''}
            onChange={(e) => updateValue(item.id, e.target.value)}
            disabled={session.submitted}
            className={`w-full px-2 py-1.5 rounded-md border text-sm font-mono bg-card focus:outline-none focus:ring-1 focus:ring-primary ${
              session.submitted
                ? results[item.id] ? 'border-green-500' : 'border-destructive'
                : 'border-border'
            }`}
          />
        )}
        {session.submitted && !results[item.id] && (
          <div className="text-xs text-muted-foreground mt-0.5">
            Expected: <span className="font-mono text-foreground">{item.correctValue}</span>
          </div>
        )}
      </div>
    )
  }

  const hasVisualLayout = !!(lab.visualGroups?.length && lab.visualZones?.length)
  const itemMap = new Map(lab.configItems.map((i) => [i.id, i]))

  function renderVisualLayout() {
    const rowsMap = new Map<number, ConfigVisualZone[]>()
    for (const zone of lab.visualZones!) {
      const r = zone.row ?? 1
      if (!rowsMap.has(r)) rowsMap.set(r, [])
      rowsMap.get(r)!.push(zone)
    }
    const sortedRows = Array.from(rowsMap.entries()).sort(([a], [b]) => a - b)

    return (
      <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-4 space-y-3">
        {lab.visualContainerLabel && (
          <div className="text-xs font-semibold text-muted-foreground">{lab.visualContainerLabel}</div>
        )}
        {sortedRows.map(([rowNum, zones]) => (
          <div
            key={rowNum}
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${zones.length}, minmax(0, 1fr))` }}
          >
            {zones.map((zone) => {
              const colors = ZONE_COLORS[zone.color ?? 'neutral']
              const groups = (lab.visualGroups ?? []).filter((g) => g.zone === zone.id)
              return (
                <div key={zone.id} className={`rounded-md border-2 border-dashed ${colors.border} ${colors.bg} p-3 space-y-2`}>
                  <div className="text-xs font-semibold text-muted-foreground">{zone.label}</div>
                  {groups.map((group) => (
                    <div key={group.id} className="rounded-md border border-border bg-card p-3 space-y-2">
                      <div>
                        <div className="text-sm font-semibold">{group.label}</div>
                        {group.sublabel && (
                          <div className="text-xs text-muted-foreground">{group.sublabel}</div>
                        )}
                      </div>
                      {group.itemIds.map((itemId) => {
                        const item = itemMap.get(itemId)
                        if (!item) return null
                        return renderItem(item, true)
                      })}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {session.showConfirmModal && (
        <LabCompleteModal title={lab.title} timeTaken={session.timeLimit - session.timeLeft} timed={timed}
          onConfirm={() => { session.setShowConfirmModal(false); doSubmit() }} onCancel={() => session.setShowConfirmModal(false)} />
      )}
      <LabHeader title={lab.title} timed={timed} timeLeft={session.timeLeft} subtitle={lab.scenario} labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ values, timeLeft: session.timeLeft })}
        onCancelLab={session.submitted ? undefined : session.handleCancelLab} />
      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      <div className="flex-1 rounded-lg border border-border bg-card p-6 overflow-y-auto">
        {hasVisualLayout ? renderVisualLayout() : (
          <>
            <h3 className="font-semibold text-base mb-4">Configuration</h3>
            <div className="space-y-4 max-w-xl">
              {lab.configItems.map((item) => renderItem(item, false))}
            </div>
          </>
        )}
      </div>

      {/* Submit / Result */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        {!session.submitted ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Fix the configuration values, then test your changes.</p>
            <button
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition"
              onClick={() => session.setShowConfirmModal(true)}
            >
              Test Configuration
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className={`font-semibold text-sm ${allCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {allCorrect ? '✓ All configuration values are correct!' : '✗ Some configuration values are incorrect'}
            </div>
            <ExplanationBlock text={lab.explanation} />
            <button onClick={() => setRoute('skill-labs')} className="mt-2 px-4 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted/50 transition">
              Back to Skill Labs
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

