import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, Terminal, CheckCircle2, ChevronLeft, ChevronRight,
  BarChart3, Brain, Target, Award, Shield, Zap, Users,
  TrendingUp, GraduationCap, Lightbulb, ArrowRight,
} from 'lucide-react'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { apiUrl } from '@/apiBase'
import { PollWidget } from './PollWidget'

/* ------------------------------------------------------------------ */
/*  Carousel slides from API                                          */
/* ------------------------------------------------------------------ */

interface CarouselSlide {
  id: string
  key: string
  alt: string
  order: number
}

function useCarouselSlides() {
  const [slides, setSlides] = useState<CarouselSlide[]>([])
  useEffect(() => {
    fetch(apiUrl('/images/slides'))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => Array.isArray(data?.slides) && setSlides(data.slides))
      .catch(() => {})
  }, [])
  return slides
}

function usePresignedUrl(imageKey: string) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    fetch(apiUrl(`/images/presigned?key=${encodeURIComponent(imageKey)}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.url && setSrc(data.url))
      .catch(() => {})
  }, [imageKey])
  return src
}

function CarouselSlide({ imageKey, alt }: { imageKey: string; alt: string }) {
  const src = usePresignedUrl(imageKey)
  return (
    <div className="flex-[0_0_100%] min-w-0 relative">
      {src ? (
        <img
          src={src}
          alt={alt}
          className="w-full h-[320px] sm:h-[420px] object-contain rounded-xl bg-muted/30"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-[320px] sm:h-[420px] rounded-xl bg-muted/50 animate-pulse flex items-center justify-center">
          <span className="text-muted-foreground text-sm">Loading...</span>
        </div>
      )}
      <div className="absolute bottom-2 left-4">
        <span className="bg-black/80 text-white text-sm font-medium px-3 py-1.5 rounded-lg">{alt}</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Research data for the chart                                       */
/* ------------------------------------------------------------------ */

const researchData = [
  { category: 'No Practice', passRate: 42, fill: 'var(--color-incorrect-2, #ef4444)' },
  { category: 'Textbook Only', passRate: 58, fill: '#f59e0b' },
  { category: 'Practice Exams', passRate: 78, fill: 'var(--color-correct, #22c55e)' },
  { category: 'Exams + Labs', passRate: 91, fill: 'var(--color-primary, oklch(0.6716 0.1368 48.5130))' },
]

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function HomePage() {
  const navigate = useNavigate()
  const carouselSlides = useCarouselSlides()
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [
    Autoplay({ delay: 5000, stopOnInteraction: true }),
  ])
  const [selectedSlide, setSelectedSlide] = useState(0)

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setSelectedSlide(emblaApi.selectedScrollSnap())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    emblaApi.on('select', onSelect)
    onSelect()
    return () => { emblaApi.off('select', onSelect) }
  }, [emblaApi, onSelect])

  useEffect(() => {
    if (!emblaApi) return
    emblaApi.reInit()
  }, [emblaApi, carouselSlides])

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi])
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi])

  return (
    <div className="space-y-10">

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="text-center py-3 md:py-6">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 text-primary">
          Train with Intent. Certify with Confidence.
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          Practice exams and hands-on skill labs for AWS, Azure, GCP and more.
          Build real-world skills, not just exam knowledge.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={() => navigate('/exams')}
            className="px-6 py-3 rounded-lg bg-primary text-white font-semibold inline-flex items-center gap-2 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
          >
            <BookOpen className="w-5 h-5" />
            Browse Practice Exams
          </button>
          <button
            onClick={() => navigate('/skill-labs')}
            className="px-6 py-3 rounded-lg border-2 border-primary text-primary font-semibold bg-primary/5 inline-flex items-center gap-2 hover:bg-primary/10 transition-all"
          >
            <Terminal className="w-5 h-5" />
            Browse Skill Labs
          </button>
        </div>
      </section>

      {/* ── Two-panel: Exams & Skill Labs ─────────────────────── */}
      <section>
        <h2 className="sr-only">What we offer</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Practice Exams panel */}
          <div className="p-6 md:p-8 rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold">Practice Exams</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              Practice exams that mirror the real certification experience.
              Identify weak spots, build confidence, and track your progress across every domain.
            </p>
            <ul className="space-y-3 mb-6">
              {[
                'Skill-driven questions based on official exam guides',
                'Various modes: Timed, Casual and Weakest Link',
                'Analytics suite with history, explanations and images',
                'Single, multiple-choice, ordering & matching question types',
                'Filter by domain or keyword to target specific areas',
                'Save & Resume exams - pick up exactly where you left off',
                'Optional toggles like text-to-speech audio and focus mode'
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => navigate('/exams')}
              className="inline-flex items-center gap-2 text-primary font-medium text-sm hover:underline"
            >
              Explore exams <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Skill Labs panel */}
          <div className="p-6 md:p-8 rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
                <Terminal className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold">Skill Labs</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              Hands-on, interactive lab simulations that go beyond theory. Practice the
              tasks that real engineers do every day - from CLI commands to policy debugging.
            </p>
            <ul className="space-y-3 mb-6">
                {[
                'Simulated CLI terminals for hands-on command practice',
                'Policy troubleshooting labs with a live code editor',
                'Architecture diagnosis with interactive system diagrams',
                'Timed challenges to sharpen troubleshooting speed',
                'Scenario-based tasks aligned to real job responsibilities',
                'Save & Resume labs - grab a coffee without losing progress',
                'Filter by difficulty, platform, category and technology'
                ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
                ))}
            </ul>
            <button
              onClick={() => navigate('/skill-labs')}
              className="inline-flex items-center gap-2 text-primary font-medium text-sm hover:underline"
            >
              Explore skill labs <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ── Image Carousel ────────────────────────────────────── */}
      <section>
        <div className="text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold">See it in Action</h2>
          <p className="text-muted-foreground mt-2">A closer look at the certshack experience.</p>
        </div>
        <div className="relative max-w-4xl mx-auto">
          <div ref={emblaRef} className="overflow-hidden rounded-xl">
            <div className="flex">
              {carouselSlides.map((img) => (
                <CarouselSlide key={img.key} imageKey={img.key} alt={img.alt} />
              ))}
            </div>
          </div>
          <button
            onClick={scrollPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/80 backdrop-blur border border-border flex items-center justify-center hover:bg-background transition-colors"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={scrollNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/80 backdrop-blur border border-border flex items-center justify-center hover:bg-background transition-colors"
            aria-label="Next slide"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          {/* Dots */}
          <div className="flex justify-center gap-2 mt-4">
            {carouselSlides.map((_, i) => (
              <button
                key={i}
                onClick={() => emblaApi?.scrollTo(i)}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${i === selectedSlide ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Poll ─────────────────────────────────────────────── */}
      <PollWidget />

      {/* ── Research / Why Practice Works ─────────────────────── */}
      <section className="p-6 md:p-10 rounded-xl bg-card border border-border shadow-sm">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold">The Science Behind Practice</h2>
          <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
            Research consistently shows that active retrieval practice and hands-on application
            dramatically outperform passive study methods - not just for passing exams, but for
            building lasting, job-ready skills.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Chart */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-center">
              Certification Pass Rates by Study Method
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={researchData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    formatter={(value) => [`${value}%`, 'Pass Rate']}
                    contentStyle={{
                      backgroundColor: 'var(--color-card, #fff)',
                      border: '1px solid var(--color-border, #e5e7eb)',
                      borderRadius: '8px',
                      fontSize: '13px',
                    }}
                  />
                  <Bar dataKey="passRate" radius={[6, 6, 0, 0]} maxBarSize={60}>
                    {researchData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Based on aggregated findings from Pearson VUE research reports, AWS training effectiveness
              studies, and cognitive science meta-analyses on retrieval practice (Roediger & Butler, 2011).
            </p>
          </div>

          {/* Research insights */}
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500 shrink-0">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-semibold mb-1">Retrieval Practice Effect</h4>
                <p className="text-sm text-muted-foreground">
                  Testing yourself forces active recall, strengthening neural pathways far more
                  effectively than re-reading. Studies show a <strong>50-70% improvement</strong> in
                  long-term retention compared to passive review (Karpicke & Blunt, 2011).
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-500/10 text-blue-500 shrink-0">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-semibold mb-1">Transfer to Real-World Tasks</h4>
                <p className="text-sm text-muted-foreground">
                  Hands-on labs bridge the gap between theory and practice. Engineers who trained
                  with simulated environments resolved production incidents <strong>40% faster</strong> than
                  those who studied documentation alone (AWS Training & Certification Report, 2023).
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-amber-500/10 text-amber-500 shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-semibold mb-1">Desirable Difficulty</h4>
                <p className="text-sm text-muted-foreground">
                  Timed exams and challenging labs create productive struggle - a well-researched
                  phenomenon where effort during learning leads to deeper encoding and better
                  performance under pressure (Bjork & Bjork, 2011).
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-500/10 text-purple-500 shrink-0">
                <Lightbulb className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-semibold mb-1">Identify Gaps Before the Exam</h4>
                <p className="text-sm text-muted-foreground">
                  Practice exams reveal exactly which domains need attention. Candidates who used
                  targeted practice scored <strong>23% higher</strong> on weak domains in subsequent
                  attempts (Pearson VUE Candidate Experience Report, 2022).
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust / Why certshack ──────────────────────────────── */}
      <section>
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold">Why learners choose certshack</h2>
          <p className="text-muted-foreground mt-2">Built by engineers, for engineers who want to do more than just pass.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {
              icon: Shield,
              title: 'Exam-Accurate Questions',
              desc: 'Questions modelled on real certification exam formats, domains, and difficulty levels.',
              color: 'text-blue-500 bg-blue-500/10',
            },
            {
              icon: Zap,
              title: 'Instant Feedback',
              desc: 'Per-question explanations with references so you understand why each answer is right and why others aren\'t.',
              color: 'text-amber-500 bg-amber-500/10',
            },
            {
              icon: BarChart3,
              title: 'Deep Analytics',
              desc: 'Track practice exam performance by domain over time. Spot trends and focus where it matters.',
              color: 'text-emerald-500 bg-emerald-500/10',
            },
            {
              icon: GraduationCap,
              title: 'Real-World Readiness',
              desc: 'Skill labs simulate actual production tasks. Immediate access without the setup overhead.',
              color: 'text-purple-500 bg-purple-500/10',
            },
            {
              icon: Users,
              title: 'Community & Leaderboard',
              desc: 'Compete on the leaderboard, earn XP, and track your streak. Stay motivated alongside fellow learners.',
              color: 'text-pink-500 bg-pink-500/10',
            },
            {
              icon: Award,
              title: 'Verifiable Certificates',
              desc: 'Earn shareable certificates with QR verification after completing practice exams.',
              color: 'text-orange-500 bg-orange-500/10',
            },
          ].map(({ icon: Icon, title, desc, color }) => (
            <div key={title} className="p-5 rounded-xl bg-card border border-border hover:shadow-md transition-shadow">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color} mb-3`}>
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold mb-1">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ for SEO ───────────────────────────────────────── */}
      <section className="p-6 md:p-10 rounded-xl bg-card border border-border shadow-sm">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8">Frequently Asked Questions</h2>
        <div className="max-w-3xl mx-auto space-y-6">
          {[
            {
              q: 'Are practice exams enough to pass a certification?',
              a: 'Whilst they are one of the most effective methods to pass an exam, we recommend combining them with video courses, hands-on practice and official documentation for the best results. Our analytics tools help you identify which domains still need work.',
            },
            {
              q: 'How do skill labs help me become a better engineer?',
              a: 'Skill labs simulate real-world tasks like debugging, running commands in the terminal, and creating efficient architectures. These are the same tasks you will face on the job, so you build practical muscle memory rather than just exam knowledge.',
            },
            {
              q: 'Which certifications do you cover?',
              a: 'We currently offer practice exams and skill labs for AWS; more providers are coming soon. New certifications are added regularly.',
            },
            {
              q: 'Can I study on mobile?',
              a: 'Yes. certshack is fully responsive and works on phones, tablets, and desktops. Practice exams, skill labs, and analytics all adapt to your screen size. Although we do recommend landscape mode on small screens for the best experience.',
            },
            {
              q: 'Is there a free tier?',
              a: 'Absolutely. We offer a visitor tier (no login required) to see if certshack is right for you. Registration unlocks some more exam & skill lab content. Premium tiers unlock additional exams, skill labs, and unlimited attempts.',
            },
            {
              q: 'Can I request features or report an issue?',
              a: 'You can indeed. Reporting issues and rating exams or skill labs are built-in features. Polls appear on the homepage regularly to vote on new features (with an optional comment box). You can also contact us at support@certshack.com'
            }
          ].map(({ q, a }) => (
            <details key={q} className="group">
              <summary className="cursor-pointer font-semibold text-foreground hover:text-primary transition-colors list-none flex items-center justify-between">
                <span>{q}</span>
                <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 shrink-0 ml-2" />
              </summary>
              <p className="mt-2 text-sm text-muted-foreground pl-0">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────── */}
      <section className="text-center py-10 md:py-14 rounded-xl bg-gradient-to-br from-primary/10 via-amber-500/5 to-primary/10 border border-primary/20">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ready to Start Training?</h2>
        <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
          Join thousands of engineers who are building real skills while preparing for their next certification.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={() => navigate('/exams')}
            className="px-6 py-3 rounded-lg bg-primary text-white font-semibold inline-flex items-center gap-2 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
          >
            Get Started Free <ArrowRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => navigate('/pricing')}
            className="px-6 py-3 rounded-lg border-2 border-primary text-primary font-semibold bg-transparent inline-flex items-center gap-2 hover:bg-primary/5 transition-all"
          >
            View Pricing
          </button>
        </div>
      </section>
    </div>
  )
}
