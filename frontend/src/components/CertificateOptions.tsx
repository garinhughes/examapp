import { useState } from 'react'
import type { PassedExam } from '../gamification/types'
import type { CertOptions } from './CertificatePreview'

interface CertificateOptionsProps {
  passedExams: Record<string, PassedExam>
  labsCompleted: number
  onGenerate: (opts: CertOptions) => void
  loading: boolean
}

export default function CertificateOptions({
  passedExams,
  labsCompleted,
  onGenerate,
  loading,
}: CertificateOptionsProps) {
  const [includeExams, setIncludeExams] = useState(true)
  const [selectedExamCodes, setSelectedExamCodes] = useState<string[] | null>(null)
  const [includeLabs, setIncludeLabs] = useState(true)
  const [includeProviderGrouping, setIncludeProviderGrouping] = useState(true)

  const examCodes = Object.keys(passedExams)
  const hasPassedExams = examCodes.length > 0
  const hasLabs = labsCompleted > 0
  const hasContent = hasPassedExams || hasLabs

  const toggleExamCode = (code: string) => {
    setSelectedExamCodes((prev) => {
      if (prev === null) {
        // Switch from "all" to explicit list minus this code
        return examCodes.filter((c) => c !== code)
      }
      if (prev.includes(code)) {
        return prev.filter((c) => c !== code)
      }
      return [...prev, code]
    })
  }

  const handleGenerate = () => {
    onGenerate({
      includeExams,
      selectedExamCodes: includeExams ? selectedExamCodes : null,
      includeLabs,
      includeProviderGrouping,
    })
  }

  if (!hasContent) {
    return (
      <div className="p-6 rounded-xl border border-border bg-card text-center">
        <div className="text-4xl mb-3">🎓</div>
        <h3 className="text-lg font-semibold mb-1">No certificate data yet</h3>
        <p className="text-sm text-muted-foreground">
          Pass an exam or complete a skill lab to generate your certificate.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-lg border border-border bg-card">
        <h3 className="text-sm font-semibold mb-4 text-muted-foreground">
          Certificate Options
        </h3>

        <div className="space-y-3">
          {/* Include exams toggle */}
          {hasPassedExams && (
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Include Passed Exams</div>
                  <div className="text-xs text-muted-foreground">
                    Show exams you've passed on the certificate
                  </div>
                </div>
                <button
                  onClick={() => setIncludeExams(!includeExams)}
                  className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${
                    includeExams ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`inline-block w-4 h-4 rounded-full bg-card shadow transform transition-transform mt-1 ${
                      includeExams ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Per-exam checklist */}
              {includeExams && (
                <div className="mt-3 ml-2 space-y-1.5">
                  {examCodes.map((code) => {
                    const exam = passedExams[code]
                    const isSelected =
                      selectedExamCodes === null || selectedExamCodes.includes(code)
                    return (
                      <label
                        key={code}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleExamCode(code)}
                          className="rounded border-border accent-primary"
                        />
                        <span className="font-medium">{code}</span>
                        <span className="text-muted-foreground text-xs">
                          ({exam.provider} · {exam.bestScore}%)
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Group by provider toggle */}
          {hasPassedExams && (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Group by Provider</div>
                <div className="text-xs text-muted-foreground">
                  Organise exams under AWS, Azure, GCP headings
                </div>
              </div>
              <button
                onClick={() =>
                  setIncludeProviderGrouping(!includeProviderGrouping)
                }
                className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${
                  includeProviderGrouping ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`inline-block w-4 h-4 rounded-full bg-card shadow transform transition-transform mt-1 ${
                    includeProviderGrouping ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          )}

          {/* Include labs toggle */}
          {hasLabs && (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Include Skill Labs</div>
                <div className="text-xs text-muted-foreground">
                  Show the number of skill labs you've completed ({labsCompleted})
                </div>
              </div>
              <button
                onClick={() => setIncludeLabs(!includeLabs)}
                className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${
                  includeLabs ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`inline-block w-4 h-4 rounded-full bg-card shadow transform transition-transform mt-1 ${
                    includeLabs ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Generating…' : '🎓 Generate Certificate'}
      </button>
    </div>
  )
}
