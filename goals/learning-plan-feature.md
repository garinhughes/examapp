# Learning Plans — Feature Plan

> Guided, visual, multi-month roadmaps that take a user from "I want to be an AI
> Engineer" to a stack of passed certs + completed labs + external milestones.
> Status: **proposal / not started**. Save location: `examapp/todo/`.

---

## 1. Concept

A **Learning Plan** is an ordered sequence of **steps** grouped into **stages**
(Beginner → Intermediate → Advanced). The user starts from a **goal + provider(s)
+ focus areas** (or a curated seed track), gets a **suggested plan**, then
**composes it freely** — adding and dropping exams, labs, and fundamentals — into
a personalised, checkable timeline. See **§2.5** for the builder (the core UX);
curated tracks in §2 are just the seed templates it starts from.

A step is one of these **step types**:

| Step type | Source | Completion rule |
|---|---|---|
| `exam` | Existing exam JSON (`backend/data/exams/`) | Auto-checked only after a **finished attempt at/above pass mark** (cannot self-tick) |
| `lab` | Existing skill lab (`backend/data/skill-labs/`) | Auto-checked on lab completion; manual tick allowed for paid labs not yet taken |
| `course` | Off-platform — **prompt only, no link**: "Find a video course on a popular platform covering X" | Manual self-tick |
| `project` | Off-platform hands-on (e.g. "build & deploy a static site") | Manual self-tick |
| `reading` | Off-platform docs / book / whitepaper topic | Manual self-tick |
| `walkthrough` | **Our own** YouTube exam-question walkthroughs — references a channel/playlist/video, **always free in-app** (gating, if any, lives on YouTube) | Manual self-tick (embedded/linked — exception to no-link rule, see §3.3) |
| `milestone` | Marker only ("You're now job-ready for junior X roles") | Auto when all prior steps in stage done |

Key principles:
- **Visual & timeline-based** — horizontal/vertical timeline with stage bands.
- **Flexible** — user can start at any stage, skip optional steps, reorder within
  a stage where order isn't enforced (`locked: false`).
- **Tier-aware** — steps can be locked behind `registered` / `pro` / `pro_plus`.
- **No external links (for now).** Off-platform steps describe *what to learn* and
  *where to learn it generically* — e.g. "Watch a video course on a popular
  platform covering Docker fundamentals" — without naming a specific provider
  (no YouTube/Udemy/etc.) and without an outbound URL. This keeps us off the
  affiliate-vs-neutral question, avoids dead links, and keeps users on-platform.
  A `url` field may be added later if we decide to curate links.
- **Honest gating** — exam steps are integrity-gated: no manual check-off.

---

## 2. Tracks & exams we already have

Existing exams mapped to levels (from `level` field, 0=foundation … 3=specialty):

| Level | Exams |
|---|---|
| 0 (foundation) | AI-901, AIF-C01, CLF-C02, GAIL-2025, EX200 (RHCSA) |
| 1 (associate) | ADP-2025, AI-103, AI-300, CCA-F, SAA-C03, SC-500 |
| 2 (professional) | CS0-003, DOP-C02, PMLE-2025/2026, PT0-003 |
| 3 (specialty) | SCS-C03 |

### Proposed starter tracks

1. **AI / ML Engineer**
   `AI-901 → AIF-C01 → GAIL-2025 → CCA-F → AI-103 → ADP-2025 → AI-300 → PMLE`
   + foundations: Linux, Python project, RAG app project.
2. **Security Engineer**
   `SY0-701 → CS0-003 → SC-500 → PT0-003 → SCS-C03`
   + foundations: Linux, Networking, home-lab project.
3. **Cloud / Solutions Architect**
   `CLF-C02 → SAA-C03 → DOP-C02` + Linux, Networking, Terraform project.
4. **Foundation add-ons** (selectable alongside any track):
   - **Linux** — EX200 (RHCSA) + linux skill labs.
   - **Networking** — *needs a Network+ exam (see §7 gaps)*.
   - **Containers / Kubernetes** — *needs a K8s exam (see §7 gaps)*.

Track definitions live as data, not code (see §4) so they're editable without a
deploy. **They are starting templates, not fixed paths** — once enrolled, a user
composes and edits their own plan (see §2.5).

---

## 2.5 Composable plan builder (the user journey)

Curated tracks (§2) are **seeds**. The real model is a builder where the user
expresses intent and we generate a starting plan they can then edit freely.

### 2.5.1 What the user selects
1. **Goal / role** — e.g. *Cloud DevOps Engineer*, *AI Engineer*, *Security
   Engineer*. (Drives the spine of suggested exams.)
2. **Provider(s)** — one or more of `AWS` / `Azure` / `Google` / `multi-cloud`.
   Filters which provider-specific exams are suggested (a user who picks AWS only
   sees AWS certs for the cloud spine, not Azure equivalents).
3. **Focus areas / interests** — multi-select tags layered on top of the goal:
   `security`, `linux`, `networking`, `containers`, `coding`, `iac`, `devops`,
   `data`, `ml`. Each tag injects relevant fundamentals.
4. **Starting level** — Beginner / Intermediate / Advanced (where the timeline
   begins; earlier steps are shown but pre-collapsed/optional).

### 2.5.2 Worked example (the user's scenario)

> "Cloud DevOps Engineer, with some security + linux + coding, within AWS."

Generated starting plan:

| Stage | Step | Type | Source | Droppable? |
|---|---|---|---|---|
| Fundamentals | Security+ (`SY0-701`) | exam | `security` focus | yes |
| Fundamentals | RHCSA (`EX200`) | exam | `linux` focus | yes |
| Fundamentals | "Learn Python or Node.js" | course | `coding` focus | yes |
| Fundamentals | Docker basics | course/lab | `containers` focus | yes |
| Fundamentals | Git basics | course/lab | `coding`/`devops` | yes |
| Fundamentals | Terraform basics | course/lab | `iac` focus | yes |
| Cloud spine | `CLF-C02` | exam | goal+AWS, **easy** | **yes — drop if too easy** |
| Cloud spine | `SAA-C03` | exam | goal+AWS | keep |
| Cloud spine | `DOP-C02` | exam | goal+AWS | keep |
| Apply | Walkthroughs for the above | walkthrough | our YouTube | optional |

The user can **drop `CLF-C02`** (too easy) and keep `SAA-C03` + `DOP-C02` — i.e.
the cloud spine from starter track #3 minus its foundation cert. Every suggested
step is add/droppable except where a prerequisite makes it `locked` (see §2.5.4).

### 2.5.3 How suggestions are derived

Rather than hand-curating every goal×provider×focus combination, suggestions come
from **tagging the catalog**, then composing:

- **Exams** already carry `provider` and `level`. Add lightweight `roles[]` and
  `focusAreas[]` tags to each exam's metadata (in `exam-generator` exam JSON, or a
  side `exam-tags.json`) — e.g. `DOP-C02 → roles:[devops,sre], focus:[devops,iac],
  provider:AWS`.
- **Fundamentals templates** per focus tag (`linux`, `coding`, `containers`,
  `iac`, `git`, `networking`) define the generic `course`/`lab`/`project` steps to
  inject. These are platform-neutral prompts (§ principles) — "Learn Python or
  Node.js on a popular video platform", "Docker basics", "Git basics", "Terraform
  basics".
- **Skill labs** are suggested by the same filters — labs matching the chosen
  `providers` plus cross-cutting `linux`/`comptia` labs relevant to the focus areas
  (see §12 for the free-then-paid ordering).
- **Composer logic**: `suggested = fundamentals(focusAreas) + examsMatching(goal,
  providers, focusAreas) + labsMatching(providers, focusAreas)`, ordered by `level`
  / free-before-paid, grouped into stages. Implemented as a backend endpoint
  `POST /learning-plans/suggest { goal, providers[], focusAreas[], startLevel }`
  → returns a draft plan (stages + steps) the client renders in the builder.

### 2.5.4 Editing rules in the builder
- **Add** any catalog exam, lab, or fundamentals template not already present
  (searchable picker, filtered by the chosen providers but overridable).
- **Drop** any non-locked step (e.g. `CLF-C02`).
- **Locked steps**: a step can declare `prereqOf`/`requires` so dropping a
  prerequisite warns ("`SAA-C03` builds on cloud basics"). Hard locks are rare —
  default to *soft warnings*, let the user decide.
- **Reorder** within a stage where `locked: false`.
- Result is saved as a **personal plan instance** (a user-owned copy of the
  composed definition), not a shared template — so edits don't affect the seed
  track or other users.

### 2.5.5 Data implications
- Enrollment stores the **composed plan definition** (or a diff against the seed
  track) under the user, since plans are now per-user-editable rather than purely
  global JSON. Two options:
  - **(A) Snapshot**: store the full composed `stages/steps` JSON on the
    enrollment item. Simple; plan is self-contained.
  - **(B) Seed + overrides**: store `seedTrackId` + `added[]` / `dropped[]` /
    `reordered[]`. Smaller; survives seed-track improvements.
  - *Recommendation:* start with **(A) snapshot** for v1 simplicity; revisit (B)
    if we want plans to auto-absorb new official exams.
- This supersedes the "global plan def + thin progress" split in §3 for *custom*
  plans; the global `learning-plans/*.json` files remain as **seed templates** the
  builder starts from.

---

## 3. Plan structure (data model)

### 3.1 Plan / track definition — `backend/data/learning-plans/*.json`

```jsonc
{
  "id": "ai-engineer",
  "title": "AI Engineer",
  "tagline": "From zero to production AI engineer.",
  "icon": "sparkles",
  "estimatedWeeks": 24,
  "stages": [
    {
      "id": "beginner",
      "label": "Beginner",
      "steps": [
        {
          "id": "ai-901",
          "type": "exam",
          "ref": "AI-901",                // exam code | lab id | null for external
          "title": "Pass Azure AI Fundamentals",
          "locked": false,                // ordering lock within stage
          "requiresTier": "registered",   // visitor|registered|pro|pro_plus
          "optional": false,
          "estimatedHours": 12
        },
        {
          "id": "rag-project",
          "type": "project",
          "ref": null,
          "title": "Build a RAG chatbot over your own docs",
          // off-platform steps describe what to do — NO url (see principles).
          // optional `prompt` gives the generic where-to-learn guidance:
          "prompt": "Find a video course on a popular platform covering RAG, then build a chatbot over your own docs.",
          "requiresTier": "pro",
          "optional": true,
          "estimatedHours": 20
        }
      ]
    }
  ]
}
```

Notes:
- `requiresTier` drives the **lock overlay** (reuse `useEntitlements` tier ladder:
  `visitor < registered < pro < pro_plus`).
- `paidLab: true` (for `type: lab`) → step shows "Free trial / Pro" badge using the
  existing `showcase` flag from `skillLabStore`.
- Off-platform steps (`course`/`project`/`reading`) carry `title` + optional
  `prompt` (generic guidance) — **no `url`, no named platform** (see principles).

### 3.2 User progress — DynamoDB table `examapp-learning-plans`

```
PK: userId          (Cognito sub)
SK: planId#stepId    (composite)
attrs:
  status: 'todo' | 'in-progress' | 'done'
  source: 'manual' | 'auto-exam' | 'auto-lab'
  completedAt: ISO | null
  evidence: { attemptId?, score?, labSessionId? }   // for auto-checked steps
  startedStage: 'beginner'|'intermediate'|'advanced' // where user chose to begin
  updatedAt: ISO
```

Plus one **plan-enrollment** item per user/plan. **Multiple concurrent
enrollments are supported** — the `plan#planId` sort key means N plans coexist
under one `userId` with no schema change:
```
PK: userId   SK: plan#planId
  enrolledAt, startStage, lastReminderAt
  seedTrackId: 'cloud-devops' | null     // template it was built from, if any
  builder: { goal, providers[], focusAreas[], startLevel }  // user's selections
  definition: { stages: [ ... ] }        // SNAPSHOT of the composed plan (§2.5.5 opt A)
```

Because plans are **user-composed** (§2.5), the enrollment carries the plan
*definition* itself (snapshot), not just a pointer to a global JSON file. The
`planId` for a custom plan is generated per enrollment. Global
`learning-plans/*.json` files remain only as **seed templates**.

Anonymous visitors: store the composed plan + progress in `localStorage` keyed by
`visitorId`; offer "sign in to save your plan" — mirrors how attempts handle
visitors.

### 3.3 `walkthrough` steps — our own exam-question videos

We will publish **our own YouTube videos** walking through exam questions, and
these can be slotted into plans. This is the **one allowed exception** to the
no-external-links rule (§ principles): it's first-party content that promotes the
platform, not a third-party affiliate link.

**Always free in-app — gating lives on YouTube.** Walkthrough steps are never
tier-locked here (`requiresTier` is not used on them). Where we want to restrict
who can watch, we do it **on YouTube** (unlisted videos, members-only content,
etc.) and the plan simply **references the channel or playlist**. The app just
points users to it; YouTube enforces access.

```jsonc
{
  "id": "saa-c03-walkthroughs",
  "type": "walkthrough",
  "ref": "SAA-C03",                 // optional: exam this video/playlist relates to
  "title": "SAA-C03 question walkthroughs",
  // reference a playlist OR a single video OR the channel — store IDs, not urls:
  "playlistId": "PLxxxxxxxxxxxx",    // preferred for a series
  "videoId": "dQw4w9WgXcQ",          // optional: a specific video
  "durationMins": 18,                // optional, single-video only
  "optional": true
  // no requiresTier — always free in-app
}
```

- Store **IDs** (`playlistId` / `videoId` / `channelId`), not raw URLs, so the
  frontend builds the embed/link and we control the player (privacy-enhanced
  `youtube-nocookie` embed, lazy-loaded).
- Prefer referencing a **playlist** for a question-walkthrough series so new videos
  appear automatically without editing the plan; a single `videoId` is fine for a
  one-off.
- Render inline on the plan timeline as a thumbnail → click to play in a modal, so
  the user stays on-platform rather than bouncing to YouTube.
- Completion: manual self-tick (no reliable signal that a video was watched).
  *Future:* the YouTube IFrame API can fire an `ended` event to auto-tick — note as
  a later enhancement, not v1.
- A `walkthrough` step may **`ref` an exam** so we can surface "📺 Watch the
  walkthrough" contextually next to that exam's `exam` step, or auto-suggest the
  video after a failed attempt on that exam.
- Optional later: a `walkthroughs.json` registry (playlistId/videoId, title,
  examCode, topic) so videos can be reused across multiple plans without
  duplicating metadata.

---

## 4. Integrity gating (the important bit)

> **Exam steps can only be checked off by actually passing the exam.**

- Frontend renders exam steps with **no manual checkbox** — only a "Start exam"
  CTA + a locked/greyed tick.
- On exam finish, the **attempts flow** (already computes `score` + pass mark from
  exam meta `passMark`) writes/derives completion.
- Backend reconciliation: a `GET /learning-plans/:planId/progress` endpoint joins
  the user's finished attempts (`attemptsStore`, `status:'finished'`, `score >=
  passMark`) against exam steps and marks them `done` server-side. **Source of
  truth is attempts, not a client tick.**
- Lab steps similarly reconcile against `skillLabAttemptsStore` completions.
- `course`/`project`/`reading`/`walkthrough` steps: client `POST
  /learning-plans/:planId/steps/:stepId { status:'done' }` — trusted manual tick
  (low stakes).

### 4.1 Cross-plan reconciliation (multi-track)

Because a user can be enrolled in **multiple tracks at once** (§9) and the same
exam/lab can appear in more than one track (e.g. `EX200` in both *Linux* and
*Cloud Architect*), completion must be derived from the underlying achievement,
not stored per-plan-step as the source of truth:

- Reconciliation joins the user's finished attempts / lab sessions against **every
  enrolled plan's** steps. Passing `EX200` once marks that step `done` in all
  plans containing it.
- `evidence` (attemptId / score / labSessionId) is the same across plans; only the
  `planId#stepId` progress rows differ.
- Manual external steps remain per-plan (a "build a website" project in plan A is
  not the same as one in plan B unless they share a `stepId` ref — keep external
  step IDs plan-scoped).
- Endpoint shape: `GET /learning-plans/progress` (no planId) returns progress for
  **all** of the user's enrollments in one call, so the "My Plans" overview can
  render every active timeline without N requests.

---

## 5. Tier locking rules

| Tier | What's unlocked on a plan |
|---|---|
| `visitor` | View any plan timeline (read-only preview). Can tick external steps locally. Exam/lab steps show "Sign in / upgrade". |
| `registered` | Enroll + save progress. Exam steps within the free question/attempt limits. `showcase` labs only. |
| `pro` | All exam steps, all labs except `pro_plus`-only, paid-lab steps. |
| `pro_plus` | Everything; advanced tracks + premium projects. |

Reuse existing `resolveUserTier` / `TIERS` ladder from `backend/src/catalog.ts`.
A step's `requiresTier` is compared against the user's tier; below → render a lock
overlay with an upgrade CTA (link to `PricingPage`). **No new entitlement product
needed** — plans piggyback on existing tiers.

---

## 6. Bi-weekly reminder emails

Reuse the existing cron pattern (`backend/src/routes/cron.ts` + EventBridge +
`x-cron-secret` + SES + `emailLogs` + signed-JWT unsubscribe).

- New cron job `POST /internal/cron/learning-plan-nudge`.
- Cadence: **strict 14 days** (decided — §9, not adaptive). The 14-day window is
  intentional: it tolerates a family/partner holiday before treating a user as
  "off track", so we don't nudge someone who's simply away.
- Schedule: a **daily** EventBridge run that checks `lastReminderAt > 14d ago` per
  enrollment (preferred over a literal every-14-days rule — more robust to missed
  runs, and the 14-day gate lives in the per-enrollment check).
- Logic: for each active enrollment, if user has **no completed step in the last
  14 days** AND plan isn't 100% done AND not unsubscribed → send "you're falling
  behind, your next step is X" email, and stamp `lastReminderAt`.
- New SES template `learning-plan-nudge` (add via `emailTemplates` CRUD) +
  `sendLearningPlanNudgeEmail` in `services/ses.ts`.
- Respect existing unsubscribe (`/unsubscribe` signed JWT) — add a `plan-nudge`
  email-preference category so users can opt out of just these.
- Infra: add EventBridge rule in `infra/terraform/` mirroring the expiry-reminder
  rule; remember to set env on **both** `ecs/main.tf` and `ecs-task-def.json`.

---

## 7. Missing exams to add (user-flagged gaps)

These tracks reference certs we don't have JSON for yet. Add via the
`exam-generator` pipeline (guide → prompt → merge):

| Exam | Code | Track use | Status |
|---|---|---|---|
| CompTIA Network+ | `N10-009` | Networking foundation | ✅ decided — user adding soon |
| Kubernetes KCNA | `KCNA` | Containers foundation | ✅ decided (KCNA over CKA) — user adding soon |
| Cisco CCNA (optional) | `200-301` | Deeper networking | optional, later |

**Linux is NOT a gap — use `EX200` (RHCSA).** It already exists in `exams/` and
covers the `linux` focus area for v1. CompTIA Linux+ (`XK0-005`) is an optional
*alternative/lighter* path we can add later, but no Linux exam is needed to launch.

Linux & Kubernetes **skill labs exist as empty files** (`linux.json`,
`kubernetes.json` are 0-length) — populate `linux.json` to give the EX200/Linux
track lab steps; `kubernetes.json` follows with the K8s exam.

---

## 8. Build phases

> **These are a build/PR sequence.** Every phase merges straight to `main` (no
> feature flags). The user-facing nav entry ships **last** so nothing half-built
> is exposed — see §13 for merge order and the go-live PR.

### Phase 1 — Seed tracks + read-only timeline (MVP)
- [ ] Define 2–3 seed tracks as JSON (`ai-engineer`, `security-engineer`,
      `cloud-devops`) in `backend/data/learning-plans/`.
- [ ] `learningPlanStore.ts` service (load seed defs, like `examStore`).
- [ ] `GET /learning-plans` (list seeds) + `GET /learning-plans/:id` (detail).
- [ ] Frontend `LearningPlansPage.tsx` + `LearningPlanDetailPage.tsx` under
      `frontend/src/learning-plans/` — visual timeline, stage bands, step cards.
      **Mobile responsive (≤375px) — vertical timeline on mobile.**
- [ ] `walkthrough` step rendering (§3.3): thumbnail → modal `youtube-nocookie`
      embed (lazy-loaded), manual tick. Optional `walkthroughs.json` registry.
- [ ] Route component wired in `ExamApp.tsx` **but no Sidebar nav entry yet** —
      the nav link is the go-live PR (§13.1/§13.2 PR 6), so the feature stays
      unreachable until complete.

### Phase 2 — Composable plan builder (§2.5)
- [ ] Tag the catalog: add `roles[]` + `focusAreas[]` to exams (exam JSON or a
      side `exam-tags.json`); optionally tag labs with `focusAreas[]` (else fall
      back to provider+category); define fundamentals templates per focus tag.
- [ ] `POST /learning-plans/suggest { goal, providers[], focusAreas[], startLevel }`
      → composer returns a draft plan, incl. labs filtered by provider+focus and
      ordered **free-before-paid** via the `showcase` flag (§12).
- [ ] Builder UI: goal + provider(s) + focus-area pickers → suggested timeline with
      **add / drop / reorder** per step (drop `CLF-C02`, keep the rest). `@dnd-kit`
      already in the stack for reordering. **Mobile responsive.**
- [ ] Save composed plan as a per-user **snapshot** enrollment (§2.5.5 opt A).

### Phase 3 — Progress + integrity gating
- [ ] `examapp-learning-plans` DynamoDB table (Terraform).
- [ ] `learningProgressStore.ts` + `GET/POST .../progress` endpoints, incl.
      `GET /learning-plans/progress` (all enrollments at once — §4.1).
- [ ] Reconcile exam/lab steps from `attemptsStore` / `skillLabAttemptsStore`,
      applying completion across **all** plans sharing a step (§4.1).
- [ ] Manual tick for external/walkthrough steps; checkbox locked for exams.
- [ ] Multiple concurrent plans; "My Plans" overview lists all active timelines.
      localStorage for visitors.

### Phase 4 — Tier locking polish
- [ ] Lock overlays + upgrade CTAs per `requiresTier`.
- [ ] Free-then-paid lab ordering + paid-lab badges via `showcase` (see §12).

### Phase 5 — Reminder emails
- [ ] Cron job + SES template + EventBridge rule + unsubscribe category.

### Phase 6 — Gamification (see §11)
- [ ] Stage / track / first-plan / multi-track ("Polymath") badges in `badges.ts`.
- [ ] Extend badge `ctx` with `plansCompleted` / `stagesCompleted` from progress.
- [ ] Bonus XP on stage/track completion (no double-count with exam XP); CMR on
      first-time track completion.
- [ ] Confetti + end-of-stage badge markers on the timeline.

### Phase 7 — Missing exams + labs (post-launch; Linux already covered by EX200)
- [ ] Network+, Kubernetes (KCNA) exams via exam-generator.
- [ ] Populate empty `linux.json` (for the EX200/Linux track) and `kubernetes.json`
      skill labs.
- [ ] Add Networking / Containers foundation add-on tracks.

---

## 9. Product decisions & open questions

**Decided:**
- ✅ **Multiple tracks at once.** A user can enroll in several plans concurrently
  (e.g. *AI Engineer* + *Linux* foundation). Progress is per-plan; the
  enrollment item is keyed `userId / plan#planId`, so N enrollments coexist
  naturally. UI shows an "active plans" list; each has its own timeline + nudge
  schedule. A shared step (same exam in two plans) is reconciled once from
  attempts and reflected as `done` in **every** plan that contains it — see
  §4.1.
- ✅ **Gamification on completion.** Completing a stage or whole track awards
  badges/XP via the existing `GamificationContext`. See §11.

- ✅ **No external/affiliate links (for now).** Off-platform steps are
  platform-neutral prompts with no URL (§ principles). The only outbound video
  content is **our own** YouTube exam walkthroughs via the `walkthrough` step
  type (§3.3).
- ✅ **Walkthroughs are free in-app; gate on YouTube.** `walkthrough` steps are
  never tier-locked in the app — they reference our channel/playlist/video and any
  access restriction is enforced on YouTube (unlisted/members-only), not here.
- ✅ **Composable plans, not curated-only.** Users build their own plan from goal +
  provider(s) + focus areas and add/drop/reorder steps (§2.5). Seed tracks are just
  templates.
- ✅ **Free-labs-first, paid-labs-later.** Suggested skill labs follow the same
  provider+focus filtering as exams, ordered free → paid so the paid asks land once
  the user has built trust (§12).
- ✅ **Reminder cadence: strict 14-day.** Fixed every-14-days, **not** adaptive.
  The 14-day window is deliberate — it tolerates a family/partner holiday before a
  user is considered "off track", so we don't nudge someone who's simply away (§6).
- ✅ **Walkthrough completion is manual.** No YouTube IFrame `ended` auto-tick —
  users self-tick walkthrough steps. Keeps it simple; revisit only if requested (§3.3).
- ✅ **Custom plans stored as a full snapshot** (§2.5.5 option A). The enrollment
  carries the complete composed `stages/steps` JSON — self-contained, no seed-diff
  to reconcile. (Trade-off accepted: plans don't auto-absorb later seed-track edits.)
- ✅ **Launch without Networking & Containers tracks.** They depend on exams we
  don't have yet (Network+, KCNA) — ship the launch without them and add them
  post-launch once those exams exist (§7, §13.5). No track shipped at launch points
  at a missing exam.
- ✅ **Kubernetes exam = KCNA; Networking = Network+** — user will add both soon via
  the exam-generator pipeline. KCNA (entry-level) over CKA for the containers
  foundation (§7).

**Still open:** _none — all product decisions resolved._

---

## 10. Reuse map (don't rebuild)

| Need | Existing thing to reuse |
|---|---|
| Tier ladder + locking | `catalog.ts` `TIERS`, `resolveUserTier`, `useEntitlements` |
| Exam pass detection | `attemptsStore` finished attempts + exam `passMark` |
| Lab completion | `skillLabAttemptsStore`, `showcase` flag |
| Cron + email + unsubscribe | `cron.ts`, `ses.ts`, `emailLogs`, `emailTemplates`, `/unsubscribe` |
| Visitor identity | `auth/visitorId.ts` |
| Badges on completion | `GamificationContext`, `badges.ts`, `types.ts` |
| New exams/labs | `exam-generator/` pipeline (see its CLAUDE.md) |

---

## 11. Gamification on plan completion (decided ✅)

Hook plan progress into the **existing** gamification system rather than building a
parallel reward track. The model is client-evaluated: `badges.ts` holds
`BadgeDefinition`s whose `check(state, ctx)` predicate runs against
`GamificationState` (`xp`, `level`, `streak`, `passedExams`, `labsCompleted`,
`cmr`). Plan badges follow the same shape.

### 11.1 New badges (add to `frontend/src/gamification/badges.ts`)
- **Stage badges** — one per stage cleared, e.g. *"Beginner Complete — AI Engineer"*.
- **Track badges** — completing a whole track, e.g. *"AI Engineer"* 🤖,
  *"Security Engineer"* 🛡️. These are prestige badges (rarer, higher XP).
- **First-plan badge** — *"Charting a Path"* for enrolling in any plan.
- **Multi-track badge** — *"Polymath"* for completing 2+ tracks (ties to the
  multi-track decision in §9).

### 11.2 Where completion is evaluated
- The plan-progress context must expose track/stage completion to gamification.
  Cleanest path: extend the badge `ctx` (the second `check` arg) with
  `plansCompleted: string[]` and `stagesCompleted: string[]`, populated from the
  `GET /learning-plans/progress` response (§4.1).
- A track counts as complete when **all non-`optional` steps** across all stages are
  `done`. A stage completes when its non-optional steps are `done`.
- Because exam/lab steps are reconciled from real attempts (§4, §4.1), these badges
  inherit the same integrity guarantee — you can't earn the *AI Engineer* badge
  without actually passing its exams.

### 11.3 XP / CMR
- Award **XP** per step completed (small) and a **bonus** on stage/track completion.
- Do **not** double-count: passing an exam already grants XP/CMR via the existing
  flow. Plan completion XP is an *additional* bonus for finishing the curated path,
  not a re-award of the underlying exam.
- Reuse `cmr` (Cloud Mastery Rating) only for first-time track completions, matching
  its existing "first-time passes only" semantics.

### 11.4 Surfacing
- Show earned/locked plan badges on the plan detail timeline (end-of-stage markers)
  and in the existing badges UI.
- Optional: a small "🎉 Track complete" `Confetti` moment (component already exists)
  when the final step flips to `done`.

---

## 12. Skill labs in plans — free-first, paid-later (decided ✅)

Skill-lab steps are suggested with the **same goal/provider/focus filtering as
exams** (§2.5), and **sequenced to build trust before asking for money.**

### 12.1 Which labs are suggested
- Labs matching the user's chosen **provider(s)** — e.g. AWS user → `aws.json`
  labs. The `providers.json` registry already groups lab IDs by provider.
- Plus cross-cutting **`linux` and `comptia`** labs relevant to the focus areas
  (so a Cloud DevOps + Linux + security learner also gets Linux and CompTIA labs,
  regardless of cloud provider).
- Filtered/ranked by the lab's `category` / `difficulty` against the user's focus
  areas and starting level.

### 12.2 Free → paid ordering (the conversion play)
- **Early stages: free labs only.** Use the existing `showcase` flag — `showcase:
  true` labs are the free ones (`labShowcaseCount` per tier in `catalog.ts`). The
  composer front-loads these so the user gets hands-on wins for free.
- **Later stages: introduce paid labs.** Once the user has completed several free
  labs and (ideally) passed an exam or two, the plan surfaces non-showcase (paid)
  labs. Trust is highest here → highest intent to purchase/upgrade.
- Concretely, the composer assigns labs a `paid: boolean` (derived from
  `!showcase`) and **sorts free-before-paid within the lab set**, biasing free labs
  toward Beginner/Intermediate stages and paid labs toward Advanced.

### 12.3 Locking & CTA
- Paid lab steps render with the existing **"Pro" / upgrade badge** and a lock
  overlay for tiers below `pro` (reuse §5 tier ladder + `showcase` semantics).
- The upgrade CTA on a paid lab step links to `PricingPage` — but is positioned
  *after* the user has momentum, not at plan start.
- Paid labs remain **droppable** in the builder (§2.5.4); we suggest, never force.

### 12.4 Data
- No new lab schema needed — `showcase`/`showcaseOrder` already exist in
  `skillLabStore`. The composer just reads them.
- Optionally tag labs with `focusAreas[]` (like exams in §2.5.3) for sharper
  matching; until then, fall back to `provider` + `category` heuristics.

---

## 13. Deployment strategy — straight to `main`, no flags (decided ✅)

**No feature flags.** Every phase merges straight to `main` and ships live on
deploy. The whole feature lands as a tight sequence of PRs deployed close
together. The discipline is therefore in **merge order + per-PR completeness**:
each PR must leave `main` coherent and must not surface a half-built UI to users.

### 13.1 The rule: nothing user-facing until it works
Because there's no flag to hide behind, the **user-visible entry point ships
last**:
- The **Sidebar nav entry + route** in `ExamApp.tsx` is added in the **final PR**,
  once everything it links to is functional. Until then the backend routes, data
  table, and components exist on `main` but are simply **not linked from anywhere**
  (dead code paths, not dark-flagged code).
- Backend `/learning-plans/*` routes can ship early — an unlinked, unauthenticated-
  noise-free API endpoint with no nav pointing at it is inert and safe.
- Each PR is self-contained and must pass `pnpm build` / `pnpm dev` (no test
  framework — §examapp conventions) and not regress existing screens.

### 13.2 Merge order (deployed close together)
Each PR is independently mergeable to `main` and adds no user-facing surface until
the last one:
1. **Data + infra** — DynamoDB tables (Terraform), seed track JSON,
   `learningPlanStore` + read routes. No nav entry. Inert.
2. **Builder + composer** — catalog tagging, `/learning-plans/suggest`, builder
   components. Still not linked from nav.
3. **Progress + integrity gating** — progress table reconciliation, exam/lab
   completion, multi-track (§4.1).
4. **Tier locking + free→paid labs** (§5, §12).
5. **Gamification** (§11) + **reminder emails** (§6) — cron route + EventBridge
   rule. (Cron can be live early; it just finds no enrollments until users exist.)
6. **Go-live PR** — add the **Sidebar nav entry + route**, final polish, announce.
   This is the only PR that changes what users see.

Keep the gap between PR 1 and PR 6 short ("not far behind each other") so `main`
doesn't carry large unlinked subsystems for long.

### 13.3 Release gate (before the go-live PR)
All must be true before merging PR 6 (the one that exposes it):
- Seed tracks defined; the builder produces a sensible plan for the §2.5.2 worked
  example end-to-end.
- Exam/lab completion reconciliation verified against a real passed attempt.
- Mobile (≤375px) verified on plans list, builder, and timeline.
- Reminder cron tested against a seeded enrollment (dry-run).
- No shipped track points at a missing exam. (Linux is covered by **`EX200`** —
  resolved; only Networking/Containers tracks need the §7 exams, so don't ship
  those tracks until their exams land.)

### 13.4 Rollback
- No flag to flip. Rollback = **revert the go-live PR** (removes the nav entry/
  route) — the backend + table stay in place but become unreachable again. Faster
  and lower-risk than reverting the whole stack.
- No data migration to unwind; the tables simply sit idle.

### 13.5 What can follow shortly after go-live
These degrade gracefully and can land in the days after launch without holding it
back (tracks hide steps whose content isn't ready):
- Additional **seed tracks** beyond the first 2–3.
- The **missing exams** (Network+, KCNA) and populated `linux.json` /
  `kubernetes.json` labs (§7). *(Linux itself ships at launch via `EX200`.)*
- **Auto-tick walkthroughs** via the YouTube IFrame API (§9 open item).
