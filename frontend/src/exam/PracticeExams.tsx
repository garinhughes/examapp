import { useExam } from './ExamContext'
import { Play, Info, BarChart3, ShoppingCart } from 'lucide-react'
import { useBasket } from '@/basket/BasketContext'
import { useEntitlements } from '@/hooks/useEntitlements'
import { useState, useEffect } from 'react'

export function PracticeExams() {
  const {
    providers, examStarted, anySavedExam, selected, savedProgress,
    setupExamFromMeta, resumeExam, setSelected, setRoute
  } = useExam()
  const basket = useBasket()
  const { products } = useEntitlements()
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (basket.lastError) setActionError(basket.lastError)
  }, [basket.lastError])

  function formatPrice(pence: number): string {
    const pounds = pence / 100
    return pounds % 1 === 0 ? `£${pounds}` : `£${pounds.toFixed(2)}`
  }

  return (
    <div className="mb-6">
      {/* Resume banner */}
      {anySavedExam && !examStarted && (
        <div className="mb-4 p-4 rounded-lg bg-card border border-border shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-md flex items-center justify-center bg-primary/10 text-primary text-lg flex-shrink-0">
              <Play className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-foreground">Exam in progress</div>
              <div className="text-sm text-muted-foreground">{anySavedExam.title} — {anySavedExam.answeredCount}/{anySavedExam.total} answered</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-3 py-1 rounded-md bg-primary text-white text-sm inline-flex items-center gap-2 shadow-sm hover:opacity-95 transition" onClick={() => resumeExam(anySavedExam.code)}>
              <Play className="w-4 h-4" /> Resume
            </button>
          </div>
        </div>
      )}

      <div role="note" className="mb-4 p-3 rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground flex items-start gap-3">
        <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-primary" aria-hidden />
        <div className="leading-snug">This product is not affiliated with or endorsed by any certification provider. All questions are original and created for practice purposes only.</div>
      </div>

      <div className="space-y-6">
        {providers.map((p) => (
          <div key={p.provider}>
            <h3 className="font-semibold mb-2">{p.provider}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {p.exams.map((ex: any) => (
                <div key={ex.code} className="p-4 rounded-lg border border-border bg-card text-card-foreground shadow-sm relative flex flex-col">
                  <div className="flex-1">
                    <div className="font-medium">{ex.title ?? ex.code}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{ex.code}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      className={`px-3 py-1 rounded font-medium text-sm inline-flex items-center gap-2 transition-colors ${examStarted || anySavedExam || (selected && savedProgress) ? 'bg-muted/60 text-muted-foreground/60 border border-border cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
                      disabled={!!(examStarted || anySavedExam || (selected && savedProgress))}
                      title={examStarted || anySavedExam || (selected && savedProgress) ? 'Complete or cancel your current exam first' : 'Setup this exam'}
                      onClick={() => { if (examStarted || anySavedExam || (selected && savedProgress)) return; setupExamFromMeta(ex) }}
                    >
                      Setup Exam
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelected(ex.code); setRoute('analytics') }}
                      title={`View analytics for ${ex.title ?? ex.code}`}
                      className="px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm inline-flex items-center gap-2"
                      aria-label={`Analytics for ${ex.title ?? ex.code}`}
                    >
                      <BarChart3 className="w-4 h-4" aria-hidden />
                      <span className="sr-only">Analytics</span>
                    </button>
                    {(() => {
                      const productId = `exam:${ex.code}`
                      const product = products.find((p) => p.productId === productId)
                      if (!product || product.owned) return null
                      const inBasket = basket.has(productId)
                      return (
                        <button
                          onClick={(e) => { e.stopPropagation(); if (!inBasket) {
                            const ok = basket.add(product)
                            if (!ok) setActionError(basket.lastError)
                          } }}
                          title={inBasket ? 'Already in basket' : `Add ${ex.code} to basket`}
                          className={`px-2 py-1 rounded text-sm inline-flex items-center gap-2 ${
                            inBasket
                              ? 'bg-primary/10 text-primary cursor-default'
                              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                          }`}
                          aria-label={inBasket ? `${ex.code} in basket` : `Add ${ex.code} to basket`}
                        >
                          <ShoppingCart className="w-4 h-4" aria-hidden />
                          {!inBasket && <span className="text-xs font-medium">{formatPrice(product.priceGBP)}</span>}
                        </button>
                      )
                    })()}
                  </div>
                  {ex.logo && (
                    ex.logoHref ? (
                      <a href={ex.logoHref} title="Amazon.com Inc., Apache License 2.0 <http://www.apache.org/licenses/LICENSE-2.0>, via Wikimedia Commons" target="_blank" rel="noopener noreferrer" className="absolute bottom-2 right-2 inline-flex items-center justify-center bg-background rounded-full p-1 shadow-sm" aria-label={`${ex.provider ?? 'Provider'} logo link`}>
                        <img src={ex.logo} alt={`${ex.provider ?? 'Provider'} logo`} className="h-6 w-auto" style={{ objectFit: 'contain' }} />
                      </a>
                    ) : (
                      <div className="absolute bottom-2 right-2 inline-flex items-center justify-center bg-background rounded-full p-1 shadow-sm" aria-hidden>
                        <img src={ex.logo} alt={`${ex.provider ?? 'Provider'} logo`} className="h-6 w-auto" style={{ objectFit: 'contain' }} />
                      </div>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
