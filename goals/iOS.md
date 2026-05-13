# iOS App — CertShack Mobile

## Overview

React Native (Expo) app targeting iOS first, Android later. Exam-only — no skill labs. Connects to the existing `api.certshack.com` backend over HTTPS with no new infrastructure required. Full offline support, native IAP via RevenueCat + Apple StoreKit, App Store distribution.

---

## Repo Structure

Add a `mobile/` directory at the monorepo root alongside `backend/` and `frontend/`.

```
examapp/
├── backend/
├── frontend/
├── mobile/          ← new
│   ├── app/         ← screens (Expo Router, file-based)
│   ├── components/
│   ├── hooks/
│   ├── lib/         ← API client, storage, sync queue
│   └── assets/      ← icon, splash screen
├── infra/
```

---

## Phase 1 — Foundation

- Initialise Expo project with Expo Router (file-based navigation, similar to Next.js)
- Configure EAS Build for cloud compilation (no Mac required for CI)
- Set up TypeScript, ESLint, path aliases consistent with existing frontend conventions
- Bundle ID: `com.certshack.examapp`
- Configure `app.json` — name, icon, splash screen, orientation, permissions

---

## Phase 2 — Auth

- Integrate Cognito via `amazon-cognito-identity-js` — login, register, token refresh
- Store JWT tokens securely in device keychain (`expo-secure-store`)
- Support visitor mode (no account) mirroring the web app's `x-visitor-id` header flow
- Auth screens: sign in, register, forgot password

---

## Phase 3 — Exam Browsing & Core Flow

- Exam list screen — fetches from existing `GET /exams` endpoint
- Exam detail screen — metadata, pass mark, question count, domain breakdown
- Start attempt — `POST /attempts`, mirrors existing logic including attempt limits by tier
- Question screen — multiple choice UI, progress indicator, timer
- Results screen — score, pass/fail, domain breakdown
- Attempt history screen per exam

---

## Phase 4 — Offline Support

- Pre-fetch question bank to device when exam is opened with connectivity
  - Walk question JSON, download all diagram URLs from S3 to device filesystem (`expo-file-system`)
  - Swap S3 URLs for local file paths in the stored JSON
  - Store mutated JSON in SQLite (`expo-sqlite`)
  - Mark exam as "available offline" in UI
- Attempt state managed locally-first during an active exam
  - Answers, timer, progress written to SQLite on every change
  - Sync to backend on completion or when connectivity returns
- New backend endpoint: `POST /attempts/:id/sync` — accepts completed attempt payload in bulk for offline submissions
- Connectivity-aware sync queue — `expo-network` / NetInfo listener flushes pending syncs on reconnect
- Show offline availability status per exam; "Remove offline" option to clear cached data

### Infra Note (CORS)
- S3 images bucket CORS policy currently allows `certshack.com` and `localhost:5173` only
- Update Terraform to allow requests with no `Origin` header (mobile clients don't send one)
- API CloudFront already forwards `Origin` header — no changes needed there

---

## Phase 5 — In-App Purchases (RevenueCat + Apple StoreKit)

- Integrate RevenueCat SDK — handles StoreKit, receipt validation, entitlement management cross-platform
- Products defined in App Store Connect: Pro and Pro Plus subscriptions (mirror existing Stripe plan structure)
- Paywall screen — shown when a visitor or free user attempts a restricted exam
- Purchase flow: RevenueCat → StoreKit → Apple processes → RevenueCat webhook → backend grants entitlement in DynamoDB
- New backend webhook endpoint: `POST /webhooks/revenuecat` — validates RevenueCat signature, updates user tier in DynamoDB
- Restore purchases support (required by Apple)
- Entitlement check on app foreground resume (token refresh + tier re-fetch)

### RevenueCat Cost
- Free up to $2.5k monthly tracked revenue, then percentage-based

---

## Phase 6 — Polish & Pre-Submission

- Diagrams rendered via `<Image source={{ uri }} />` — works identically for S3 URLs (online) and local file paths (offline)
- Push notifications via `expo-notifications` — optional, for "new exam available" or streak reminders
- App icon and splash screen (ICS/CertShack branding)
- Proper loading states, error boundaries, empty states
- Haptic feedback on answer selection (`expo-haptics`)
- Dark mode support

---

## Phase 7 — TestFlight & App Store Submission

**TestFlight**
- EAS Build produces `.ipa`, EAS Submit uploads to App Store Connect
- Internal testing (yourself) — instant
- External testing (up to 10,000) — ~1 day Apple review
- Test all flows on real device: auth, exam, offline (airplane mode), IAP sandbox

**App Store Listing**
- Name: CertShack
- Subtitle: AWS, CompTIA & Cloud Exams (30 chars — covers key search terms)
- Keywords (100 chars): `aws,comptia,cloud,certification,practice,exam,quiz,study,az-900,solutions-architect`
- Screenshots: required at iPhone and iPad resolutions — include diagram questions prominently to differentiate from generic quiz apps
- Privacy policy URL (required)
- Support URL
- Content rating questionnaire — straightforward for exam content
- Export compliance — yes to standard HTTPS encryption
- Privacy nutrition labels — auth data, usage data (attempt history)

**Apple Developer Program**
- £79/year
- Enrol at developer.apple.com — allow 24–48hrs for identity verification

---

## Infrastructure Changes (Terraform)

Minimal — existing infra handles mobile traffic without modification.

| Change | Reason |
|---|---|
| S3 images bucket CORS — allow no-origin requests | Mobile clients don't send `Origin` header |
| WAF review — confirm rate limits won't affect mobile users | Same IP limits apply; 2000 req/5min is fine for exam use |
| Secrets Manager — add RevenueCat webhook secret | New webhook endpoint needs signature validation |
| New backend env var: `REVENUECAT_WEBHOOK_SECRET` | Passed to ECS task via existing secrets pattern |

No new AWS services, no networking changes, no security group changes.

---

## What Does Not Change

- ECS Fargate backend — unchanged, mobile is another API consumer
- DynamoDB schema — no new tables; `entitlements` table already supports tier grants
- Cognito user pool — same pool, same client, mobile uses same JWT flow
- CloudFront / ALB — mobile bypasses frontend CloudFront, hits API CloudFront directly as browsers do
- Existing Stripe/PayPal web payment flow — untouched; web purchases and app purchases coexist

---

## Cost Summary

| Item | Cost |
|---|---|
| Apple Developer Program | £79/year |
| Google Play (future) | $25 one-time |
| Expo EAS (free tier) | £0 |
| AWS (no new infra) | £0 |
| RevenueCat (until $2.5k MRR) | £0 |
