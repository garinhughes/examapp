import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Terminal, Briefcase, Link2, Check } from 'lucide-react'
import { useExam } from './ExamContext'
import { apiUrl } from '@/apiBase'
import { ProviderLogo } from '@/components/ProviderLogo'
import { useIsAdmin } from '@/auth/useIsAdmin'
import type { AppRoute } from './types'

type DomainOverview = { name: string; skills: string[] }
type LabOverview = {
  id: string
  title: string | undefined
  difficulty: string | undefined
  labCategory: string | undefined
  platform: string | undefined
}

type Overview = {
  totalQuestions: number
  domains: DomainOverview[]
  relatedLabs: LabOverview[]
  realWorldValue?: string
  jobRoles?: string[]
}

function levelLabel(level: string | number | undefined): string {
  switch (Number(level)) {
    case 0: return 'a foundational, entry-level exam suitable for those new to the subject area'
    case 1: return 'an associate-level exam suited to practitioners with some hands-on experience'
    case 2: return 'a professional-level exam aimed at practitioners with solid foundational knowledge'
    case 3: return 'a specialty-level exam designed for experienced practitioners'
    default: return 'a professional-level exam'
  }
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`
}

const DIFFICULTY_STYLES: Record<string, string> = {
  beginner: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  intermediate: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  advanced: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30',
}

export function ExamPageContent() {
  const { selected, selectedMeta, setRoute } = useExam()
  const isAdminFn = useIsAdmin()
  const isAdmin = isAdminFn()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [domainsOpen, setDomainsOpen] = useState(false)
  const [faqOpen, setFaqOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    fetch(apiUrl(`/exams/${encodeURIComponent(selected)}/overview`))
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setOverview(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selected])

  if (!selected || !overview) return null

  const title = selectedMeta?.title ?? selected
  const provider = selectedMeta?.provider ?? 'the provider'
  const passMark = selectedMeta?.passMark ?? 70
  const skillCount = overview.domains.reduce((n, d) => n + d.skills.length, 0)
  const rawDuration = selectedMeta?.defaultDuration ?? Math.round(overview.totalQuestions * 1.5)
  const duration = formatDuration(rawDuration)
  const examQuestions = selectedMeta?.defaultQuestions ?? selectedMeta?.defaultQuestionCount

  const pills = [
    examQuestions ? `${examQuestions} question exam` : null,
    examQuestions && overview.totalQuestions !== examQuestions ? `${overview.totalQuestions} in our bank` : (!examQuestions ? `${overview.totalQuestions} practice questions` : null),
    `${overview.domains.length} domains`,
    `${skillCount} skills`,
    `${duration} timed`,
    `Pass ${passMark}%`,
  ].filter(Boolean) as string[]

  const faqs: { q: string; a: string }[] = [
    {
      q: `What is the pass mark for the ${title} (${selected})?`,
      a: `The ${selected} requires a score of ${passMark}% or higher to pass. Most providers report results as a scaled score (e.g. 750 out of 1,000) rather than a raw percentage. We display this as a percentage equivalent for clarity.`,
    },
    ...(examQuestions ? [{
      q: `How many questions are in the ${selected} exam?`,
      a: `The official ${selected} exam contains ${examQuestions} questions. Our practice question bank covers ${overview.totalQuestions} questions, each mapped to a specific exam objective.`,
    }] : []),
    {
      q: `How long is the ${selected} exam?`,
      a: `The ${selected} is a ${duration} timed exam.`,
    },
    ...(overview.domains.length > 0 ? [{
      q: `What does the ${selected} exam cover?`,
      a: `The ${selected} covers ${overview.domains.length} domains: ${overview.domains.map(d => d.name).join(', ')}.`,
    }] : []),
    ...(overview.jobRoles && overview.jobRoles.length > 0 ? [{
      q: `What jobs can I get with the ${title}?`,
      a: `Holding the ${title} opens doors to roles including ${overview.jobRoles.join(', ')}.`,
    }] : []),
    {
      q: `Is the ${selected} exam difficult?`,
      a: `The ${selected} is ${levelLabel(selectedMeta?.level)}. It has a pass mark of ${passMark}% and covers ${skillCount} individual exam objectives across ${overview.domains.length} domains. Structured practice with skill-mapped questions and hands-on labs is the most effective preparation.`,
    },
  ]

  return (
    <div className="space-y-3">
      {/* Keyword prose */}
      <div className="p-4 rounded-lg border border-border bg-card space-y-3">
        <p className="text-sm text-foreground leading-relaxed">
          Prepare for the <strong>{title}</strong> ({selected}) certification with{' '}
          {overview.totalQuestions} practice questions covering {overview.domains.length} domains
          and {skillCount} individual exam objectives. Every question is mapped to a specific
          skill, giving you far more targeted mock exam coverage than per-domain question banks.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Whether you need {selected} sample questions to gauge your readiness, a timed practice
          exam under real conditions, or casual practice to work through weak areas, the mode
          picker above adapts to your study style. Questions are written against the official{' '}
          {provider} exam guide, include detailed explanations for every answer, and are kept up
          to date with the current exam version.
        </p>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {pills.map(label => (
            <span key={label} className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs border border-border">
              {label}
            </span>
          ))}
          {isAdmin && (
            <button
              onClick={() => {
                const url = `https://certshack.com/exams/${selected}?utm_source=linkedin&utm_medium=social&utm_campaign=${selected.toLowerCase()}`
                navigator.clipboard.writeText(url)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title="Copy share link"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Link2 className="w-3 h-3" />}
              {copied ? 'Copied' : 'Share'}
            </button>
          )}
        </div>
      </div>

      {/* Domains & Skills collapsible — content always in DOM for crawlability */}
      {overview.domains.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <button
            onClick={() => setDomainsOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
          >
            <span>
              Domains &amp; Skills{' '}
              <span className="font-normal text-muted-foreground">· {skillCount} objectives</span>
            </span>
            {domainsOpen
              ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
          </button>
          <div className={domainsOpen ? 'px-4 pb-4 space-y-3 border-t border-border pt-3' : 'hidden'}>
            {overview.domains.map(domain => (
              <div key={domain.name}>
                <p className="text-xs font-semibold text-foreground mb-1">{domain.name}</p>
                <ul className="space-y-0.5">
                  {domain.skills.map(skill => (
                    <li key={skill} className="text-xs text-muted-foreground pl-3 border-l border-border">
                      {skill}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Real-world career value */}
      {(overview.realWorldValue || (overview.jobRoles && overview.jobRoles.length > 0)) && (
        <div className="p-4 rounded-lg border border-border bg-card space-y-2">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-semibold">What this certification means for your career</span>
          </div>
          {overview.realWorldValue && (
            <p className="text-sm text-muted-foreground leading-relaxed">{overview.realWorldValue}</p>
          )}
          {overview.jobRoles && overview.jobRoles.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary pt-1">Job Roles</p>
              <ul className="space-y-1">
                {overview.jobRoles.map(role => (
                  <li key={role} className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    {role}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Related Skill Labs */}
      {overview.relatedLabs.length > 0 && (
        <div className="p-5 rounded-lg border border-border bg-card shadow-sm space-y-3">
          <h2 className="text-base font-semibold inline-flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            Related Skill Labs
          </h2>
          <p className="text-xs text-muted-foreground">Hand-picked labs to build the practical skills tested in this exam:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {overview.relatedLabs.map(lab => (
              <div
                key={lab.id}
                role="button"
                tabIndex={0}
                onClick={() => setRoute(`skill-lab-detail:${lab.id}` as AppRoute)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRoute(`skill-lab-detail:${lab.id}` as AppRoute) } }}
                className="rounded-lg border border-border bg-card overflow-hidden flex flex-col cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ProviderLogo provider={lab.platform} size="sm" />
                <div className="p-3 pt-4 flex flex-col gap-2">
                  <div className="text-sm font-medium leading-tight">{lab.title ?? lab.id}</div>
                  <div className="flex items-center justify-between gap-2">
                    {lab.labCategory && (
                      <div className="text-xs text-muted-foreground">{lab.labCategory}</div>
                    )}
                    {lab.difficulty && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ml-auto ${DIFFICULTY_STYLES[lab.difficulty] ?? 'bg-muted text-muted-foreground border-border'}`}>
                        {lab.difficulty}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FAQ — content always in DOM for crawlability */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <button
          onClick={() => setFaqOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
        >
          <span>
            Frequently Asked Questions{' '}
            <span className="font-normal text-muted-foreground">· {faqs.length} questions</span>
          </span>
          {faqOpen
            ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
        </button>
        <div className={faqOpen ? 'px-4 pb-4 space-y-4 border-t border-border pt-4' : 'hidden'}>
          {faqs.map(({ q, a }) => (
            <div key={q}>
              <p className="text-sm font-semibold text-foreground mb-1">{q}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
