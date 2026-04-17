# CLAUDE.md — frontend

React 18 SPA. Entry: `src/main.tsx` → `src/App.tsx` (ExamProvider + BasketProvider wrapping ExamApp).

## Avoid Reading
- `dist/`, `node_modules/`

## Mobile-First Rule

**Every frontend change must be mobile responsive.** Check at mobile viewport (≤ 375px) before marking done. The app is live in beta — regressions on mobile matter.

## Key Source Files

```
src/
  App.tsx               # Root: ExamProvider + BasketProvider
  apiBase.ts            # Base URL for API calls
  analytics.ts          # Client-side analytics helpers
  clarity.ts            # Microsoft Clarity integration
  auth/
    AuthContext.tsx      # Cognito auth state + token management
    useAuthFetch.ts     # Authenticated fetch wrapper
    useIsAdmin.ts       # Admin role check
    visitorId.ts        # Anonymous visitor fingerprint
  components/
    AdminPanel.tsx       # Admin dashboard
    AccountPage.tsx      # User account management
    HomePage.tsx         # Landing page
    LoginPage.tsx        # Auth entry
    Footer.tsx
    Sidebar.tsx
    CertificateOptions.tsx, CertificatePreview.tsx, CertificatesTab.tsx, VerifyPage.tsx
    PricingPage.tsx
    Leaderboard.tsx
    DiagramsView.tsx
    CodeBlock.tsx
    PollWidget.tsx       # Homepage polls
    ImpersonationBanner.tsx
    CookieConsent.tsx, PrivacyPolicy.tsx, RefundPolicy.tsx
    TourProvider.tsx, TourBubble.tsx   # Onboarding tour
    ThemeToggle.tsx, theme-provider.tsx
    PageMeta.tsx         # SEO meta tags
    Confetti.tsx
    ui/button.tsx        # Radix-based primitives
  exam/
    types.ts            # Shared types (Exam, Question, Choice, Slot, etc.)
    ExamContext.tsx      # Central state (~160 props). Be surgical — read before editing.
    ExamApp.tsx          # Layout shell: Sidebar, header, route switch
    ExamSetup.tsx, ExamReview.tsx, QuestionNav.tsx, QuestionCard.tsx
    QuestionImage.tsx    # S3 image rendering for questions
    Modals.tsx, PracticeExams.tsx, AnalyticsView.tsx, MetricsView.tsx
    ScoreHistoryChart.tsx, SortableOrderItem.tsx, utils.tsx, downloads.ts
  gamification/
    GamificationContext.tsx, BadgeIcon.tsx, badges.ts, types.ts
  skill-labs/
    types.ts             # LabDefinition, LabSummary, Inspection types
    SkillLabsPage.tsx, SkillLabDetailPage.tsx, SkillLabRunnerPage.tsx
    SearchableFilter.tsx
    labs/
      LabHeader.tsx, LabCompleteModal.tsx, ExplanationBlock.tsx
      shared.ts, useLabProgress.ts, useLabSession.ts
      runners/           # 19 lab runner types (see below)
  hooks/
    useEntitlements.ts
    usePageTracking.ts
    useRouteSync.ts
    useTour.ts
  basket/
    BasketContext.tsx, BasketPage.tsx
    PayPalCheckout.tsx   # Lazy-loaded into BasketPage
  feedback/              # Feedback flow components
  lib/utils.ts           # Shared utilities (cn, etc.)
```

## Skill Lab Runner Types

19 runner implementations in `src/skill-labs/labs/runners/`:
`architecture-builder`, `cli`, `code-fix`, `config-toggle`, `cost-optimization`, `diagnose` (React Flow), `diagram-label`, `drag-match`, `drift-detection`, `fill-command`, `incident-response`, `log-analysis`, `network-path`, `ordering`, `performance-optimization`, `policy-fix` (Monaco Editor), `policy-simulation`, `security-hardening`, `service-limits`

## State Management

- **ExamContext** (`src/exam/ExamContext.tsx`) — ~160 context props covering exam state, question navigation, answer tracking, timer, review mode. Read it before touching exam flow.
- **BasketContext** — purchase cart state
- **GamificationContext** — badges + XP state
- **AuthContext** — Cognito tokens, user info, admin flag

## Scope Guidance

- **Exam UI**: `src/exam/` — ExamApp, ExamSetup, QuestionNav, QuestionCard, ExamReview, Modals
- **Question rendering**: `src/exam/QuestionCard.tsx` (in-exam), `ExamReview.tsx` (post-exam)
- **Exam state/logic**: `src/exam/ExamContext.tsx`
- **Auth/entitlements**: `src/auth/` + `src/hooks/useEntitlements.ts`
- **Skill Labs**: `src/skill-labs/` — page, runner selection, all 19 runner types
- **Basket/Payments**: `src/basket/` (Stripe is redirect-only; PayPal is `PayPalCheckout.tsx`)
- **Admin**: `src/components/AdminPanel.tsx` + `useIsAdmin.ts`
- **Certificates**: `src/components/Certificate*.tsx` + `VerifyPage.tsx`
