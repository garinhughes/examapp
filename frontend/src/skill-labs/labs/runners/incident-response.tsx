import { useState, useCallback, useEffect, useMemo } from 'react'
import { useExam } from '@/exam/ExamContext'
import type { IncidentResponseLabDefinition, LabAnswer } from '../../types'
import { LabHeader } from '../LabHeader'
import { ExplanationBlock } from '../ExplanationBlock'
import { useLabSession } from '../useLabSession'
import { LabCompleteModal } from '../LabCompleteModal'

interface IncidentProgress {
  selectedActions: string[]
  selectedAnswer: string
  timeLeft: number
}

interface Props {
  lab: IncidentResponseLabDefinition
  timed?: boolean
}

type TabId = 'alerts' | 'metrics' | 'logs' | 'timeline' | 'actions'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'alerts', label: 'Alerts', icon: '🔔' },
  { id: 'metrics', label: 'Metrics', icon: '📊' },
  { id: 'logs', label: 'Logs', icon: '📋' },
  { id: 'timeline', label: 'Timeline', icon: '⏱' },
  { id: 'actions', label: 'Response', icon: '🔧' },
]

const severityColor: Record<string, string> = {
  critical: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700',
  warning: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700',
  info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700',
}

const logLevelStyle: Record<string, string> = {
  ERROR: 'text-red-600 dark:text-red-400',
  WARN: 'text-amber-600 dark:text-amber-400',
  INFO: 'text-blue-600 dark:text-blue-400',
  DEBUG: 'text-gray-500 dark:text-gray-400',
}

export function IncidentResponseRunner({ lab, timed = true }: Props) {
  const { setRoute } = useExam()
  const session = useLabSession<IncidentProgress>({ lab, timed })

  const [activeTab, setActiveTab] = useState<TabId>('alerts')
  const [selectedActions, setSelectedActions] = useState<string[]>(
    () => session.savedProgress?.selectedActions ?? []
  )
  const [selectedAnswer, setSelectedAnswer] = useState(
    () => session.savedProgress?.selectedAnswer ?? ''
  )
  const [logSearch, setLogSearch] = useState('')
  const [logLevelFilter, setLogLevelFilter] = useState<string>('all')
  const [results, setResults] = useState<{ actions: Record<string, boolean>; rootCause: boolean } | null>(null)

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ selectedActions, selectedAnswer, timeLeft: session.timeLeft })
  }, [selectedActions, selectedAnswer, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !session.submitted) doSubmit()
  }, [session.timeLeft])

  const toggleAction = useCallback((actionId: string) => {
    if (session.submitted) return
    setSelectedActions(prev =>
      prev.includes(actionId) ? prev.filter(id => id !== actionId) : [...prev, actionId]
    )
  }, [session.submitted])

  const filteredLogs = useMemo(() => {
    let items = lab.logs
    if (logLevelFilter !== 'all') items = items.filter(l => l.level === logLevelFilter)
    if (logSearch) {
      const q = logSearch.toLowerCase()
      items = items.filter(l => l.message.toLowerCase().includes(q) || l.source.toLowerCase().includes(q))
    }
    return items
  }, [lab.logs, logSearch, logLevelFilter])

  const doSubmit = useCallback(async () => {
    const actionResults: Record<string, boolean> = {}
    for (const action of lab.actions) {
      if (action.correct) {
        actionResults[action.id] = selectedActions.includes(action.id)
      } else {
        actionResults[action.id] = !selectedActions.includes(action.id)
      }
    }
    const correctAnswer = lab.answers.find((a: LabAnswer) => a.correct)
    const rootCauseCorrect = selectedAnswer === correctAnswer?.id
    const allCorrect = rootCauseCorrect && Object.values(actionResults).every(Boolean)
    setResults({ actions: actionResults, rootCause: rootCauseCorrect })
    await session.finalize(allCorrect, selectedAnswer)
  }, [lab, selectedActions, selectedAnswer, session.finalize])

  const canSubmit = selectedAnswer && selectedActions.length > 0

  return (
    <div className="flex flex-col h-full gap-3">
      {session.showConfirmModal && (
        <LabCompleteModal
          title={lab.title}
          timeTaken={session.timeLimit - session.timeLeft}
          timed={timed}
          onConfirm={() => { session.setShowConfirmModal(false); doSubmit() }}
          onCancel={() => session.setShowConfirmModal(false)}
        />
      )}
      <LabHeader
        title={lab.title}
        timed={timed}
        timeLeft={session.timeLeft}
        subtitle={lab.scenario}
        labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ selectedActions, selectedAnswer, timeLeft: session.timeLeft })}
        onCancelLab={session.submitted ? undefined : session.handleCancelLab}
      />

      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition ${
              activeTab === tab.id
                ? 'bg-card shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>{tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border bg-card">
        {activeTab === 'alerts' && (
          <div className="p-4 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Active Alerts ({lab.alerts.length})</h3>
            {lab.alerts.map(alert => (
              <div key={alert.id} className={`rounded-lg border p-3 ${severityColor[alert.severity] || ''}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase">{alert.severity}</span>
                  <span className="text-xs font-mono opacity-75">{alert.time}</span>
                </div>
                <div className="text-xs font-medium mb-1">{alert.service}</div>
                <div className="text-sm">{alert.message}</div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'metrics' && (
          <div className="p-4 space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">CloudWatch Metrics</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lab.metrics.map(metric => {
                const vals = metric.values
                const max = Math.max(...vals.map(v => v.value))
                const min = Math.min(...vals.map(v => v.value))
                const latest = vals[vals.length - 1]
                const prev = vals[vals.length - 2]
                const trend = latest && prev ? (latest.value > prev.value ? '↑' : latest.value < prev.value ? '↓' : '→') : ''
                const trendColor = latest && prev
                  ? latest.value > prev.value ? 'text-red-500' : latest.value < prev.value ? 'text-green-500' : 'text-muted-foreground'
                  : ''
                return (
                  <div key={metric.id} className="rounded-lg border border-border p-3 bg-background">
                    <div className="text-xs font-medium text-muted-foreground mb-1">{metric.name}</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold tabular-nums">{latest?.value.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground">{metric.unit}</span>
                      <span className={`text-sm font-bold ${trendColor}`}>{trend}</span>
                    </div>
                    {/* Mini bar chart */}
                    <div className="mt-2 flex items-end gap-px h-10">
                      {vals.map((v, i) => {
                        const height = max === min ? 50 : ((v.value - min) / (max - min)) * 100
                        return (
                          <div
                            key={i}
                            className="flex-1 bg-primary/30 hover:bg-primary/60 transition rounded-sm relative group"
                            style={{ height: `${Math.max(height, 4)}%` }}
                            title={`${v.time}: ${v.value.toLocaleString()} ${metric.unit}`}
                          />
                        )
                      })}
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>{vals[0]?.time}</span>
                      <span>{latest?.time}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="p-4 space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search logs..."
                value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
                className="flex-1 px-3 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <select
                value={logLevelFilter}
                onChange={e => setLogLevelFilter(e.target.value)}
                className="px-2 py-1.5 text-sm rounded-md border border-border bg-background"
              >
                <option value="all">All Levels</option>
                <option value="ERROR">ERROR</option>
                <option value="WARN">WARN</option>
                <option value="INFO">INFO</option>
                <option value="DEBUG">DEBUG</option>
              </select>
            </div>
            <div className="font-mono text-xs space-y-0.5 bg-gray-950 rounded-lg p-3 max-h-80 overflow-y-auto">
              {filteredLogs.map((log, i) => (
                <div key={i} className="flex gap-2 py-0.5 hover:bg-white/5">
                  <span className="text-gray-500 shrink-0 w-20">{log.timestamp}</span>
                  <span className={`shrink-0 w-12 font-bold ${logLevelStyle[log.level] || ''}`}>{log.level}</span>
                  <span className="text-cyan-400 shrink-0 w-24 truncate">{log.source}</span>
                  <span className="text-gray-300">{log.message}</span>
                </div>
              ))}
              {filteredLogs.length === 0 && (
                <div className="text-gray-500 italic py-4 text-center">No matching log entries</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="p-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-4">Incident Timeline</h3>
            <div className="relative pl-6 space-y-0">
              {lab.timeline.map((event, i) => (
                <div key={i} className="relative pb-6 last:pb-0">
                  {i < lab.timeline.length - 1 && (
                    <div className="absolute left-[-16px] top-4 bottom-0 w-px bg-border" />
                  )}
                  <div className="absolute left-[-20px] top-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-background" />
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono text-muted-foreground shrink-0 pt-0.5 w-14">{event.time}</span>
                    <span className="text-sm">{event.event}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="p-4 space-y-6">
            {/* Root Cause Selection */}
            <div>
              <h3 className="font-semibold text-sm mb-3">What is the root cause?</h3>
              <div className="space-y-2">
                {lab.answers.map(answer => {
                  const isSelected = selectedAnswer === answer.id
                  const showResult = session.submitted && results
                  return (
                    <button
                      key={answer.id}
                      onClick={() => !session.submitted && setSelectedAnswer(answer.id)}
                      disabled={session.submitted}
                      className={`w-full text-left px-3 py-2 rounded-md border text-sm transition ${
                        showResult
                          ? answer.correct
                            ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
                            : isSelected
                              ? 'border-destructive bg-destructive/10 text-destructive'
                              : 'border-border bg-card text-muted-foreground'
                          : isSelected
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-card hover:bg-muted/50'
                      }`}
                    >
                      {answer.text}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Action Selection */}
            <div>
              <h3 className="font-semibold text-sm mb-2">Select correct remediation actions:</h3>
              <p className="text-xs text-muted-foreground mb-3">Select all actions you would take to resolve this incident.</p>
              <div className="space-y-2">
                {lab.actions.map(action => {
                  const isSelected = selectedActions.includes(action.id)
                  const showResult = session.submitted && results
                  const isCorrechtChoice = showResult ? results.actions[action.id] : undefined
                  return (
                    <button
                      key={action.id}
                      onClick={() => toggleAction(action.id)}
                      disabled={session.submitted}
                      className={`w-full text-left px-3 py-2 rounded-md border text-sm transition flex items-center gap-2 ${
                        showResult
                          ? isCorrechtChoice
                            ? 'border-green-500 bg-green-500/10'
                            : 'border-destructive bg-destructive/10'
                          : isSelected
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-card hover:bg-muted/50'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
                      }`}>
                        {isSelected && <span className="text-xs">✓</span>}
                      </span>
                      {action.description}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        {!session.submitted ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Investigate the incident across all tabs. Select root cause and remediation actions in the Response tab.
            </p>
            <button
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50"
              disabled={!canSubmit}
              onClick={() => session.setShowConfirmModal(true)}
            >
              Submit Response
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className={`font-semibold text-sm ${results?.rootCause && Object.values(results.actions).every(Boolean) ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {results?.rootCause && Object.values(results.actions).every(Boolean)
                ? '✓ Incident resolved correctly!'
                : results?.rootCause
                  ? '✗ Root cause identified but remediation actions were incorrect'
                  : '✗ Incorrect root cause identification'}
            </div>
            <ExplanationBlock text={lab.explanation} />
            <button onClick={() => setRoute('skill-labs')} className="mt-2 px-4 py-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition">
              Back to Skill Labs
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
