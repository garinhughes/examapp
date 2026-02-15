Suggestions (concise plan + implementation notes)

Tier structure (simple, clear)
Free / Visitor
Access: ~10 sample questions total, demo filters, view reports disabled
CTA: “Register to save progress”
Registered (free)
Access: ~25 rotating questions, full filters, review + local gamification
Limit: 1 saved attempt per exam, exports disabled
Paying (flexible options)
Single exam (one‑off): £3 — access that exam forever
Exam bundle (e.g., AWS bundle: all AWS certs): £9
Unlimited subscription: £6/month (or £4.50/mo billed annually = £54/yr)
Extras (optional micro): PDF report export or official practice pack + explanations £0.99–£1.99
Rationale

Keeps entry price low to avoid friction (£3–£9 fits your £5–10 cap for main offers).
Subscription provides stable ARR and appeals to heavy users; single buys suit casual buyers.
Bundles should be at noticeable discount vs many single purchases.

Feature gating per tier
Free: view limited questions, basic analytics, local gamification
Registered: more questions, saved attempts, mobile sync
Paying: full question bank, CSV/PDF downloads, unlimited attempts, leaderboard opt-in, domain mastery history, offline export

Payments & Auth
Use Cognito for auth (Google/Apple/email) already planned.
Use Stripe for payments (Checkout + Subscriptions; webhooks for entitlement updates).
Backend: store entitlements per user (userId, productId, expiresAt). Protect API endpoints by checking entitlements.
Offer trial (7 days) for subscription.

Implementation details (dev-friendly)
Products in Stripe:
SKU: exam:exam-code (one-off)
SKU: bundle:aws (one-off)
SKU: sub:all-access (recurring)
Webhooks: handle checkout.session.completed, invoice.payment_failed, customer.subscription.deleted → update entitlement DB
Restore purchases page in Account (show receipts, expiry, cancel subscription)
Allow promo codes / coupons in Stripe; student discount codes
Secure downloads by checking entitlement server-side
Anti‑sharing / fraud mitigation
Tie entitlements to Cognito sub; limit simultaneous active sessions per account (optional)
Rate limit downloads/API where needed
Provide refund policy & logs for support
Legal / tax / UX notes
Display price with VAT where required; Stripe supports tax calculation
Add clear billing & cancellation UX
Privacy: store minimal payment metadata; rely on Stripe for card handling (PCI)
Pricing experiments
A/B test:
Variant A: single £3, bundle £9, sub £6/mo
Variant B: single £4, bundle £10, sub £5/mo
Track conversion funnel: landing → register → start exam → purchase

Next steps I can implement
Scaffold Stripe Checkout + webhook handlers and product SKUs
Add entitlement model + middleware to protect resources
Add UI for single purchase & subscription checkout flow and Account → Purchases