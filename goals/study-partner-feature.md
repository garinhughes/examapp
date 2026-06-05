# Study Partner — Feature Plan

> Help learners find a **study partner or group** — matched on what they want to
> learn, how they want to study, and who they want to study with. **Not a dating
> app**: the goal is accountability and shared progress, not romance. Matching is
> intentional, opt-in, and conversations ideally move to an external channel
> (Discord/LinkedIn/Reddit) the user already uses.
>
> Status: **proposal / not started**. Location: `examapp/goals/`.

---

## 1. Concept

A user opts in by creating a **Study Partner profile**: what they're learning,
study habits, who they'd like to study with, and how to reach them. The system
surfaces **close or exact matches**, and people connect via:

1. A **vague weekly digest email** ("new people are looking for study partners who
   almost match you"), plus **immediate** emails on an exact match or an invite, and/or
2. An **in-app invite** ("study together?") to a 1:1 or a group.

Conversation then happens on the user's **chosen external channel** (Discord /
LinkedIn / Reddit / etc.) — we reveal a handle only after a mutual connect. There
is **no in-app messaging in v1** (§9.2); external handoff by design.

---

## 1.1 Entry points — Study Partner is standalone (important)

**This is NOT a downstream step of the Learning Plan feature.** For many users,
finding a study partner is the *entire reason they came to the site* — they may
never build a Learning Plan, never buy a subscription, and may not even have taken
an exam yet. Study Partner is its **own front door**, equal to (not dependent on)
Learning Plans.

Design guardrails that follow from this:

- **Interests are independent of our exam catalog.** The catalog certs are *one*
  source of interest checkboxes, but the checkbox grid + **`Other` free-text**
  stand alone. A user studying a topic we don't sell an exam for (a uni networking
  module, learning Rust, a bootcamp) is a **first-class user** and must be able to
  build a full profile and match.
- **Plan / exam signals are additive bonuses, never requirements.** "Same Learning
  Plan track" and "similar exam progress" (§3.1, §9.1) are *boosts* to the match
  score — a user with **no plan and no exam attempts** still matches fully on
  interests, language, cadence, format, and group preference. There is **no penalty
  or down-rank** for having no plan/exam history.
- **The matcher must degrade gracefully to zero plan/exam data.** Treat missing
  plan/progress as a neutral signal (weight contributes 0), not a negative. Never
  require an enrollment or attempt to appear in or compute matches.
- **Reverse the funnel: Study Partner is an acquisition channel.** Someone who came
  *only* for a partner can later be gently offered a structured Learning Plan
  ("want a roadmap for AWS too?") — **cross-sell, not prerequisite**. The coupling
  runs both ways and is always optional.

**Where the two features *do* connect (optional, both directions):** if a user
*does* have a Learning Plan, their focus-area tags can pre-fill study interests
(shared taxonomy), and same-track / same-stage users get a small matching boost.
None of this is required to use Study Partner. See
[learning-plan-feature.md](learning-plan-feature.md).

---

## 2. The profile (what we collect)

All fields are **opt-in**; the user only appears in matching once they save a
profile and toggle "I'm looking for a study partner" on.

### 2.1 What they want to learn (interests)
- **Checkbox grid** with lots of variety, grouped:
  - *Cloud*: AWS, Azure, Google Cloud, multi-cloud
  - *Topics*: Coding, Linux, Networking, Containers/Kubernetes, Security,
    DevOps, IaC/Terraform, Data, AI/ML, Databases
  - *Certs* (auto-sourced from our exam catalog): SAA-C03, SY0-701, AIF-C01, …
- **`Other` + free-text** box for anything not listed — **first-class, not a
  fallback**. Topics we sell no exam for (a uni module, a language like Rust, a
  bootcamp) must produce a complete, matchable profile (§1.1).
- Reuse the **focus-area tag vocabulary** from the Learning Plan builder
  (§2.5.1 there) so interests and plans share one taxonomy *when both are used* —
  but Study Partner interests stand alone and **do not require** the exam catalog
  or a Learning Plan.

### 2.2 About them
- **Country / region** (dropdown).
- **Language(s)** they want to study in (multi-select; ISO language list).
  **Matching requires a shared study language** (exact overlap — no
  language-exchange/cross-language matching; see §3.2).
- **Age range** — *bucketed*, never exact DOB. **18+ only**: `18–24`, `25–34`,
  `35–44`, `45–54`, `55+`. No under-18 bucket — the feature is adults-only (§6).
- **Gender** — inclusive options: Male, Female, Non-binary, Prefer not to say,
  Other (+text).
- **Gender preference for matches** — "I'd prefer to study with": Any / Men /
  Women / Same as me / etc. *Soft* preference (ranking weight), with one **hard**
  option some users need for comfort/safety: "Women only" (women-only spaces are
  a common, legitimate ask). See §4.3.

### 2.3 How they want to study
- **Frequency / commitment**: Daily, A few times a week, Weekly, Flexible /
  casual.
- **Format**: Video, Audio, Text/none — multi-select (e.g. "audio or text").
- **Group size preference**: 1:1, Group, Either.
- **Time zone** (auto-detect from browser, editable) + optional rough
  availability (mornings / evenings / weekends).

### 2.4 How to connect (off-platform first)
- **Preferred channel(s)** to start a conversation, with a handle per channel:
  Discord, LinkedIn, Reddit, X/Twitter, Email, "in-app" (if §9 built). Multi-select.
- Only the **handles the user explicitly enters** are ever shared, and only
  **after a mutual connect** (§4.4) — never shown openly in match cards.

### 2.5 Personal section
- **Free-text "About / goals"** — short bio, what they're working toward, vibe.
  Run through the existing **`profanityFilter`** before save.
- Optional: current **Learning Plan track** (if enrolled) shown on their card as
  a credibility/affinity signal.

---

## 3. Matching

### 3.1 Score, don't gate (mostly)
Compute a **match score** between two opted-in profiles rather than hard-filtering
everything — "close or exact" matches, per the request. Weighted sum:

| Signal | Weight | Logic |
|---|---|---|
| Shared interests | high | Jaccard overlap of interest tags; exact-tag matches score highest |
| Language | high | At least one shared study language (near-required) |
| Group-size preference | medium | 1:1↔1:1, group↔group; "either" is compatible with both |
| Frequency | medium | Same or adjacent commitment level |
| Format | medium | Any overlap in video/audio/text |
| Time zone | medium | Within ±N hours scores higher (matters for live study) |
| Region/country | low–med | Same region a small boost (not required — remote is fine) |
| Age range | low | Same/adjacent bucket a small boost |
| Learning Plan track | low | Same track/goal a small affinity boost — **0 if either has no plan** |
| Exam progress stage | low | Similar stage a small boost — **0 if either has no attempts** |

**Additive-only rule (see §1.1):** the plan/exam rows contribute a **bonus when
present and 0 when absent** — never a penalty. A user with no Learning Plan and no
exam attempts matches fully on the interest/language/cadence/format/group signals
above. The matcher must compute a complete score from those alone.

Output: ranked list of candidates with a **% match** and a short "why you match"
(shared tags, same language, both want group video, etc.).

### 3.2 Hard filters (the few that must gate)
- **Language**: at least one **shared** language — required (no cross-language
  matching; people must be able to study in the same language).
- **Gender preference** where set as a hard rule (e.g. "Women only") — mutually
  enforced: A only matches B if A's hard prefs allow B **and** B's allow A.
- **Blocked / hidden** users never appear (§4.3, §6).
- **18+ only** — minors are excluded from the feature entirely, so no minor↔adult
  matching is possible (§6).

### 3.3 1:1 vs group
- **1:1**: rank individual candidates.
- **Group**: suggest forming/joining a small group (3–6) of mutually-compatible
  members sharing a core interest + language + cadence. A group has an owner, a
  topic, size cap, and join requests.
- **Either**: user appears in both pools.

---

## 4. Connecting (the user flow)

### 4.1 Discover
- "Find a Study Partner" page: your match list (cards with %, interests, study
  style, region/lang, "why you match"). Filter/sort controls.
- Group tab: open groups matching your interests, with "request to join".

### 4.2 Invite
- **In-app invite**: "Invite to study" → 1:1 or "invite to my group". Sends a
  notification + (respecting prefs) an email. No contact details shared yet.

### 4.3 Consent, safety & control (important for a social feature)
- **Block** and **report** on every card/profile (reuse the `reports.ts` +
  `profanityFilter` infrastructure). Reported/blocked users are filtered out of
  each other's matching permanently.
- **Pause / hide**: one toggle to leave the pool without deleting the profile.
- **No open directory**: you only see people the matcher surfaces *to you*; there's
  no browsable global member list. Handles are hidden until mutual connect.
- **Women-only / hard prefs** honoured both directions (§3.2).
- **Rate-limit invites** (reuse `@fastify/rate-limit`) to prevent spam.

### 4.4 Mutual connect → share handles
- Contact handles (§2.4) are revealed **only after both sides accept** an invite
  ("you're connected — here's how to reach each other"). This is the moment we
  hand off to Discord/LinkedIn/etc. Conversation lives off-platform by design.

---

## 5. Emails

Reuse the cron + SES + signed-JWT unsubscribe stack
(`cron.ts`, `ses.ts`, `emailLogs`, `emailTemplates`, `/unsubscribe`).

Two tiers of email, by match strength (decided ✅):

- **Weekly digest — "near matches" (low-key).** A gentle weekly nudge: *"There are
  new people looking for study partners who almost match what you're after."*
  Deliberately **vague and low-pressure** — it signals activity without promising
  exact fits or listing people. Links back to the discover page where the user can
  look. New cron `POST /internal/cron/study-partner-digest`, EventBridge weekly.
  Skip users with no near-matches that week (no empty emails). This is the catch-all
  for *partial* matches.
- **Immediate email — exact match or invite.** Send right away (not batched) when:
  - a **strong/exact match** appears (high score — shares core interests, language,
    cadence, group pref), or
  - someone **invites** them (to 1:1 or a group), or a **connection is made**.
  Copy examples: *"Someone wants to study AWS with you"*, *"You've got a strong
  study-partner match for SAA-C03"*, *"You're connected with {name} — here's how to
  reach them."*

**User-controllable (decided ✅ — "give users flexibility").** Per-user email
preferences for this feature, so people aren't forced into a fixed cadence:
- toggle the **weekly near-match digest** on/off,
- toggle **immediate exact-match** emails on/off,
- toggle **invite/connection** emails on/off (most users keep these).
Implemented as a `study-partner` unsubscribe category (existing signed-JWT
`/unsubscribe`) with sub-toggles, surfaced in account settings. New
`emailTemplates` entries per email type. Opting out here never affects exam/expiry
mail.

---

## 6. Privacy, GDPR & safety (must-haves for a people-matching feature)

- **Fully opt-in (decided ✅).** Nothing about this feature is enabled at
  registration or by default. A user is **never** in the matching pool until they
  *actively* create a Study Partner profile and toggle "looking for a study
  partner" on. No auto-enrolment, no pre-ticked boxes. Leaving/pausing is one
  toggle (§4.3).
- **Minimal exposure.** Match cards show display name / username + interests +
  study style + coarse region. **Never** exact age, exact location, email, or
  unrevealed handles.
- **GDPR erasure.** The Study Partner profile + connections must be wiped by the
  existing `erasureService` right-to-be-forgotten flow — add this table to it.
- **18+ only (decided ✅).** The feature is **adults only** — the youngest age
  bucket starts at `18–24`; there is no under-18 option and minors are excluded
  entirely from v1. Require an attestation/confirmation that the user is 18+ when
  they create a profile.
- **Auto-profanity on submission (decided ✅).** Every free-text field — bio,
  `Other` interest text, group topic/name — is run through the existing
  `profanityFilter` **at submit time**; submissions that fail are rejected with an
  inline error before the profile/group is saved. **No human review queue for v1**
  — auto-filter only, plus user `reports.ts` reporting as the escalation path.
- **Registered minimum (decided ✅).** A user must be **signed in (`registered` or
  above)** to create a Study Partner profile — visitors cannot. This gives every
  profile an accountable Cognito identity behind it. Not pro-gated; open to all
  signed-in users.

---

## 7. Data model

New DynamoDB table **`examapp-study-partner`** (single-table, like learning plans):

```
# Profile (one per user)
PK: userId            SK: profile
  active: bool                       // in the matching pool?
  interests: string[]                // shared tag vocabulary + 'other:<text>'
  otherInterests: string
  country, languages: string[]
  ageBucket, gender, genderPref: {mode:'any|men|women|same', hard:bool}
  frequency, formats: string[], groupPref: '1:1'|'group'|'either'
  timezone, availability
  channels: [{type:'discord'|'linkedin'|..., handle}]   // private until connect
  bio                                  // profanity-checked
  planTrack?: string
  createdAt, updatedAt

# Connection / invite (between two users)
PK: userId   SK: conn#otherUserId
  state: 'invited'|'accepted'|'declined'|'blocked'
  scope: '1:1'|'group:<groupId>'
  initiatedBy, createdAt, respondedAt

# Group
PK: group#groupId   SK: meta
  ownerId, topic, interests[], language, cadence, sizeCap, memberIds[]
PK: group#groupId   SK: member#userId    // membership + join-request rows
```

Matching computation: a backend `GET /study-partner/matches` that scans/queries
active profiles, scores against the caller (§3), applies hard filters, returns
ranked candidates. (At small scale a filtered scan is fine; revisit with a GSI on
a coarse bucket — e.g. primary interest or region — if the pool grows.)

---

## 8. Routes & services (examapp conventions)

| Layer | Add |
|---|---|
| Route | `src/routes/studyPartner.ts` → `/study-partner` (profile CRUD, matches, invites, groups, block/report) |
| Service | `src/services/studyPartnerStore.ts` (profiles, connections, groups) + `matcher.ts` (scoring) |
| Cron | extend `cron.ts` → `study-partner-digest` |
| Email | `sendStudyPartnerDigestEmail`, `sendStudyPartnerInviteEmail`, `sendConnectionEmail` in `ses.ts` + templates |
| Erasure | add table to `erasureService.ts` |
| Frontend | `src/study-partner/` — `StudyPartnerProfile.tsx`, `MatchesPage.tsx`, `GroupsPage.tsx`, invite/cards. **Mobile responsive (≤375px).** |
| Nav | Sidebar entry + route in `ExamApp.tsx` — **added last** (no feature flags; ship dark until complete, per the deployment approach in the Learning Plan plan §13) |

---

## 9. Extras — decided

### 9.1 In scope ✅
- **Study sessions / "study now" ✅.** A "looking to study in the next hour" live
  flag → surfaces people online now for an impromptu session. Needs a short-TTL
  "available now" marker on the profile (DynamoDB TTL attribute) + a discover
  filter for who's live.
- **Groups in v1 ✅.** Group matching/forming ships in the **first version**
  alongside 1:1 (not deferred). Exam-tied groups (below) are part of this.
- **Group study rooms tied to an exam ✅.** Auto-suggest a group per popular exam
  (e.g. "SAA-C03 study group") so users join by goal, not just by person. The exam
  catalog seeds these groups.
- **Compatibility on plan/exam progress ✅.** Match people at a *similar stage*
  (both mid SAA-C03) so they're studying the same material at once — strong study
  fit. Derive stage from Learning Plan progress / exam attempts; add as a scoring
  signal in §3.1.

### 9.2 Out of scope ❌ (decided)
- ❌ **In-app messaging** — not in v1. Conversations happen off-platform via the
  user's chosen channel after a mutual connect (§4.4). Zero message-moderation
  burden. (Cost analysis kept in §12 for reference if revisited later.)
- ❌ **Icebreaker prompts** — skipped. They only made sense to seed an in-app
  chat; with no chat, there's nowhere to use them.
- ❌ **Mentorship** (mentor/mentee pairing) — not building.
- ❌ **Leaderboard / combined-streak tie-in** — not building.
- ❌ **Language-exchange / cross-language matching** — matches must share the same
  study language (§3.2).

---

## 10. Decisions & open questions

**Decided:**
- ✅ **Registered minimum** — must be signed in to create a profile (§6).
- ✅ **18+ only** — adults-only; no minors (§6, §2.2).
- ✅ **Fully opt-in** — never auto-enabled at registration; profile is explicit (§6).
- ✅ **Shared language required** — no language exchange (§3.2).
- ✅ **Groups in v1** — group matching ships alongside 1:1 (§9.1).
- ✅ **Email model** — vague **weekly "near-match" digest** + **immediate** email on
  exact match / invite / connection; all **user-toggleable** for flexibility (§5).
- ✅ **Auto-profanity on submission**, no human review queue for v1; reports as the
  escalation path (§6).
- ✅ **No in-app messaging / no icebreakers** — external handoff only (§9.2).
- ❌ Out: mentorship, leaderboard tie-in, language exchange (§9.2).

**Still open:** _none for v1 scope._ Possible future revisits (not blocking):
in-app messaging (cost analysis in §12), human moderation queue, and whether to
let users tune the weekly digest's match-closeness threshold.

---

## 11. Reuse map (don't rebuild)

| Need | Existing thing |
|---|---|
| Identity / display name | Cognito + `getUserBySub`, `findUserByUsername`, `updateUserFields` |
| Interest taxonomy | Learning Plan focus-area tags (`learning-plan-feature.md` §2.5) |
| Cron + email + unsubscribe | `cron.ts`, `ses.ts`, `emailLogs`, `emailTemplates`, `/unsubscribe` |
| Reporting / moderation | `reports.ts`, `profanityFilter` |
| Rate limiting | `@fastify/rate-limit` |
| GDPR erasure | `erasureService.ts` |
| Gamification (badges/streaks) | `GamificationContext` |
| Deployment approach (no flags, nav-last) | Learning Plan plan §13 |

---

## 12. In-app messaging — does it cost extra? (analysis)

**Short answer:** a *basic* in-app message thread adds **roughly nothing** to the
AWS bill — it reuses what's already running. A *real-time chat* (typing
indicators, instant delivery) is where extra cost and complexity appear. Below is
why, based on the current infra.

### 12.1 What we already have (so it's ~free)
- **Backend**: a single always-on Fargate task (0.25 vCPU) behind an ALB. It's
  running 24/7 regardless — adding a few REST endpoints (`POST /messages`,
  `GET /messages/:threadId`) uses spare capacity, **no new compute cost**.
- **Database**: DynamoDB is **PAY_PER_REQUEST**. A messages table costs only per
  read/write + storage. At this app's scale, study-partner chat traffic is tiny —
  realistically **cents/month**. Add a TTL attribute to auto-expire old messages
  and storage stays near-zero.
- **Auth, rate-limiting, moderation, GDPR erasure** — all already exist and apply
  to messages for free.

So **Option A — polling REST chat** (client fetches new messages every few seconds
while the thread is open) costs **effectively £0 extra** beyond marginal DynamoDB
request units. This is the recommended shape if we build messaging at all.

### 12.2 What *would* add cost
- **Real-time push (WebSockets).** There is **no WebSocket/realtime infra today**
  (confirmed — nothing in backend or Terraform). True instant chat needs **API
  Gateway WebSocket API** (or AppSync/Pusher/Ably). API Gateway WebSockets bill per
  million messages + connection-minutes — still cheap at low volume (low single-£
  per month) but it's **new infra to build, secure, and maintain**, plus
  connection-state handling. Not worth it for v1.
- **Email/SES notifications** for new messages — negligible (already in the SES
  free-ish tier we use for other mail), but adds to the moderation surface.
- **Moderation load (the real "cost").** The bigger cost isn't AWS — it's
  **human/operational**: messages are user-to-user content you may be expected to
  moderate, store, and produce on request. That's a policy/ops burden, not a
  server bill.

### 12.3 Cost-free alternative (the current design)
The plan's default — **external handoff** (§4.4): after a mutual connect we reveal
the handles users chose (Discord/LinkedIn/etc.) and the conversation happens
*there*. This costs **nothing**, carries **no message-moderation/storage burden**,
and is the safer v1.

### 12.4 Recommendation
- **v1: no in-app messaging.** Ship external-handoff only — zero added cost, lower
  moderation/liability surface.
- **If/when we add it: Option A (polling REST + DynamoDB w/ TTL)** — near-zero AWS
  cost, no new infra. Reserve WebSockets for later only if real-time is a proven
  ask.
- The deciding factor is **not money** (both in-app options are cheap) — it's the
  **moderation/privacy responsibility** of hosting user messages. That's the real
  reason to keep v1 external-only.
