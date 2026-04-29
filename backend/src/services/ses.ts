import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { SignJWT } from 'jose'
import { getTemplate } from './emailTemplates.js'
import { LOGO_BASE64 } from './emailAssets.js'

const ses = new SESClient({ region: process.env.AWS_REGION || 'eu-west-1' })
const wrapName = (addr: string) => `"certshack" <${addr}>`
const FROM = wrapName(process.env.SES_FROM_ADDRESS || 'noreply@certshack.com')
const OUTREACH = wrapName(process.env.SES_OUTREACH_ADDRESS || 'outreach@certshack.com')
const TO = process.env.SES_SUPPORT_ADDRESS || 'support@certshack.com'
const FRONTEND = process.env.FRONTEND_ORIGIN || 'https://certshack.com'
const BACKEND = process.env.BACKEND_ORIGIN || 'https://api.certshack.com'

// ── Shared HTML helpers ────────────────────────────────────────────────────

const LOGO_URL = `${FRONTEND}/logo_light.png`
const BRAND = '#FF6B35'

/** Build a signed, one-click unsubscribe token (JWT). */
async function buildUnsubToken(userId: string): Promise<string> {
  const secret = process.env.UNSUBSCRIBE_SECRET || 'change-me-in-production'
  const key = new TextEncoder().encode(secret)
  return new SignJWT({ sub: userId, purpose: 'unsubscribe' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('90d')
    .sign(key)
}

/**
 * Render a branded HTML email.
 * - `title` goes in the header band.
 * - `body` is raw HTML injected into the white content area.
 * - `userId` is used to generate the unsubscribe link (transactional => pass undefined).
 */
async function renderEmail(opts: {
  title: string
  body: string
  userId?: string
  isMarketing?: boolean
}): Promise<{ html: string; text: string }> {
  const unsubLine = opts.userId && opts.isMarketing
    ? `<p style="margin:0 0 8px;font-size:12px;color:#999;">
        Don't want these emails?
        <a href="${BACKEND}/unsubscribe?token={{unsubToken}}" style="color:#999;">Unsubscribe</a>
      </p>`
    : ''

  // Replace placeholder if token is actually available
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">
        <!-- Header -->
        <tr>
          <td style="background:#1a1a1a;padding:20px 32px;">
            <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <tr>
                <td style="padding:0 10px 0 0;vertical-align:middle;">
                  <img src="${LOGO_URL}" alt="" height="36" width="28" style="display:block;">
                </td>
                <td style="vertical-align:middle;">
                  <span style="font-size:22px;font-weight:bold;letter-spacing:0.5px;font-family:Arial,sans-serif;"><span style="color:#ffffff;">cert</span><span style="color:#F97316;">shack</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Heading band -->
        <tr>
          <td style="background:#f0f0f0;padding:16px 32px;border-bottom:1px solid #ddd;">
            <h1 style="margin:0;font-size:20px;color:#1a1a1a;">${opts.title}</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            ${opts.body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f4f4f4;padding:20px 32px;border-top:1px solid #e0e0e0;">
            ${unsubLine}
            <p style="margin:0;font-size:12px;color:#999;">certshack - IT Practice Exams &amp; Skill Labs Platform</p>
            <p style="margin:4px 0 0;font-size:12px;color:#999;">
              <a href="${FRONTEND}" style="color:#999;">certshack.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  if (opts.userId && opts.isMarketing) {
    try {
      const token = await buildUnsubToken(opts.userId)
      html = html.replace('{{unsubToken}}', encodeURIComponent(token))
    } catch {
      html = html.replace('{{unsubToken}}', '')
    }
  }

  // Plain-text fallback strips tags
  const text = html.replace(/<[^>]+>/g, '').replace(/\s{2,}/g, ' ').trim()
  return { html, text }
}

/**
 * Substitute simple {{variable}} placeholders in a template string.
 */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
}

async function sendHtml(opts: {
  from: string
  to: string
  cc?: string[]
  subject: string
  html: string
  text: string
}): Promise<void> {
  await ses.send(new SendEmailCommand({
    Source: opts.from,
    Destination: {
      ToAddresses: [opts.to],
      ...(opts.cc?.length ? { CcAddresses: opts.cc } : {}),
    },
    Message: {
      Subject: { Data: opts.subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: opts.html, Charset: 'UTF-8' },
        Text: { Data: opts.text, Charset: 'UTF-8' },
      },
    },
  }))
}

// ── Transactional emails ───────────────────────────────────────────────────

/**
 * Welcome email — sent once on first successful login.
 * Uses the DynamoDB template with id "welcome" if it exists, falling back to a built-in.
 */
export async function sendWelcomeEmail(params: { to: string; name: string; userId: string }): Promise<void> {
  const stored = await getTemplate('welcome')
  let subject = stored?.subject || 'Welcome aboard!'
  let bodyHtml: string
  const vars = { name: params.name || 'there', frontendUrl: FRONTEND }

  if (stored?.htmlBody) {
    bodyHtml = interpolate(stored.htmlBody, vars)
    subject = interpolate(subject, vars)
  } else {
    bodyHtml = `
      <p style="font-size:16px;color:#333;">Hi ${vars.name},</p>
      <p style="color:#555;">Welcome to certshack - where professionals sharpen their skills.</p>
      <p style="color:#555;">Start your first practice exam or skill lab and see where you stand.</p>
      <p style="margin:32px 0;">
        <a href="${FRONTEND}" style="background:${BRAND};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;">
          Start learning
        </a>
      </p>
      <p style="color:#999;font-size:13px;">If you didn't create this account, please contact <a href="mailto:support@certshack.com" style="color:#999;">support@certshack.com</a>.</p>`
  }

  const { html, text } = await renderEmail({ title: 'Welcome', body: bodyHtml })
  await sendHtml({ from: FROM, to: params.to, subject, html, text })
}

/**
 * Payment confirmed email — sent after a successful one-time or subscription purchase.
 */
export async function sendPaymentConfirmedEmail(params: {
  to: string
  name: string
  userId: string
  products: Array<{ productId?: string; label: string; priceGBP: number }>
  totalPence: number
  source: 'stripe' | 'paypal'
}): Promise<void> {
  const stored = await getTemplate('payment-confirmed')
  let subject = stored?.subject || 'Your certshack order is confirmed'
  const vars = { name: params.name || 'there', frontendUrl: FRONTEND }
  let bodyHtml: string

  if (stored?.htmlBody) {
    bodyHtml = interpolate(stored.htmlBody, vars)
    subject = interpolate(subject, vars)
  } else {
    const rows = params.products
      .map(
        (p) =>
          `<tr>
            <td style="padding:8px 0;border-bottom:1px solid #eee;color:#333;">
              ${p.label}
              ${p.productId ? `<br><span style="font-size:11px;font-family:monospace;color:#999;">${p.productId}</span>` : ''}
            </td>
            <td style="padding:8px 0;border-bottom:1px solid #eee;color:#333;text-align:right;">
              £${(p.priceGBP / 100).toFixed(2)}/mo
            </td>
          </tr>`
      )
      .join('')

    const subtotalPence = params.products.reduce((s, p) => s + p.priceGBP, 0)
    const discountPence = Math.max(0, subtotalPence - params.totalPence)
    const discountRow = discountPence > 0
      ? `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;">Discount applied</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;color:#22863a;text-align:right;">−£${(discountPence / 100).toFixed(2)}</td>
        </tr>`
      : ''

    bodyHtml = `
      <p style="font-size:16px;color:#333;">Hi ${vars.name},</p>
      <p style="color:#555;">Thanks for your purchase — your access is now active.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <th style="text-align:left;padding:8px 0;border-bottom:2px solid #FF6B35;color:#333;">Plan</th>
          <th style="text-align:right;padding:8px 0;border-bottom:2px solid #FF6B35;color:#333;">Price</th>
        </tr>
        ${rows}
        ${discountRow}
        <tr>
          <td style="padding:12px 0;font-weight:bold;color:#333;">Total charged today</td>
          <td style="padding:12px 0;font-weight:bold;color:#333;text-align:right;">
            £${(params.totalPence / 100).toFixed(2)}
          </td>
        </tr>
      </table>
      <p style="color:#555;font-size:13px;">Payment processed via ${params.source === 'stripe' ? 'card' : 'PayPal'}.</p>
      <p style="margin:32px 0;">
        <a href="${FRONTEND}" style="background:${BRAND};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;">
          Start learning
        </a>
      </p>`
  }

  const { html, text } = await renderEmail({ title: 'Order confirmed', body: bodyHtml })
  await sendHtml({ from: FROM, to: params.to, cc: [TO], subject, html, text })
}

/**
 * Payment failed — Stripe couldn't take a subscription renewal payment. Stripe will retry
 * based on dunning settings; we nudge the user to update their card before access lapses.
 */
export async function sendPaymentFailedEmail(params: {
  to: string
  name: string
  userId: string
  productLabel: string
  attemptCount: number
  nextAttempt: string | null
  manageUrl: string
}): Promise<void> {
  const stored = await getTemplate('payment-failed')
  let subject = stored?.subject || 'Payment failed — please update your card'
  const vars = {
    name: params.name || 'there',
    frontendUrl: FRONTEND,
    productLabel: params.productLabel,
    attemptCount: String(params.attemptCount),
    manageUrl: params.manageUrl,
  }
  let bodyHtml: string

  if (stored?.htmlBody) {
    bodyHtml = interpolate(stored.htmlBody, vars)
    subject = interpolate(subject, vars)
  } else {
    const nextAttemptLine = params.nextAttempt
      ? `<p style="color:#555;">We'll try again on <strong>${new Date(params.nextAttempt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</p>`
      : ''
    bodyHtml = `
      <p style="font-size:16px;color:#333;">Hi ${vars.name},</p>
      <p style="color:#555;">We couldn't process the latest payment for your <strong>${params.productLabel}</strong> subscription (attempt ${params.attemptCount}).</p>
      ${nextAttemptLine}
      <p style="color:#555;">Please update your payment method to avoid losing access.</p>
      <p style="margin:32px 0;">
        <a href="${params.manageUrl}" style="background:${BRAND};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;">
          Update payment method
        </a>
      </p>`
  }

  const { html, text } = await renderEmail({ title: 'Payment failed', body: bodyHtml })
  await sendHtml({ from: FROM, to: params.to, subject, html, text })
}

/**
 * Expiry reminder — sent when a subscription/entitlement is nearing its end.
 */
export async function sendExpiryReminderEmail(params: {
  to: string
  name: string
  userId: string
  productLabel: string
  expiresAt: string
  daysLeft: number
}): Promise<void> {
  const stored = await getTemplate('expiry-reminder')
  let subject = stored?.subject || `Your certshack access expires in ${params.daysLeft} day${params.daysLeft === 1 ? '' : 's'}`
  const vars = { name: params.name || 'there', frontendUrl: FRONTEND, daysLeft: String(params.daysLeft), productLabel: params.productLabel }
  let bodyHtml: string

  if (stored?.htmlBody) {
    bodyHtml = interpolate(stored.htmlBody, vars)
    subject = interpolate(subject, vars)
  } else {
    bodyHtml = `
      <p style="font-size:16px;color:#333;">Hi ${vars.name},</p>
      <p style="color:#555;">Your <strong>${params.productLabel}</strong> access expires in
        <strong>${params.daysLeft} day${params.daysLeft === 1 ? '' : 's'}</strong>
        (${new Date(params.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}).
      </p>
      <p style="color:#555;">Renew now to keep your progress streaks and access to all practice material.</p>
      <p style="margin:32px 0;">
        <a href="${FRONTEND}/pricing" style="background:${BRAND};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;">
          Renew access
        </a>
      </p>`
  }

  const { html, text } = await renderEmail({ title: 'Your access is expiring soon', body: bodyHtml })
  await sendHtml({ from: FROM, to: params.to, subject, html, text })
}

/**
 * Subscription cancelled — sent immediately when the customer requests cancellation.
 * Access-until date is included so the customer knows how long they retain access.
 */
export async function sendSubscriptionCancelledEmail(params: {
  to: string
  name: string
  userId: string
  productLabel: string
  productId: string
  accessUntil: string | null
  source: 'stripe' | 'paypal'
}): Promise<void> {
  const stored = await getTemplate('subscription-cancelled')
  let subject = stored?.subject || 'Your certshack subscription has been cancelled'
  const vars = { name: params.name || 'there', frontendUrl: FRONTEND, productLabel: params.productLabel, productId: params.productId }
  let bodyHtml: string

  if (stored?.htmlBody) {
    bodyHtml = interpolate(stored.htmlBody, vars)
    subject = interpolate(subject, vars)
  } else {
    const accessLine = params.accessUntil
      ? `<p style="color:#555;">You'll continue to have full access until <strong>${new Date(params.accessUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>. No further charges will be made.</p>`
      : `<p style="color:#555;">Your access has been revoked. No further charges will be made.</p>`
    bodyHtml = `
      <p style="font-size:16px;color:#333;">Hi ${vars.name},</p>
      <p style="color:#555;">We've confirmed your cancellation request.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #eee;border-radius:6px;">
        <tr>
          <td style="padding:12px 16px;background:#f9f9f9;border-radius:6px;">
            <span style="color:#333;font-weight:bold;">${params.productLabel}</span>
            <span style="font-size:11px;font-family:monospace;color:#999;margin-left:8px;">${params.productId}</span>
          </td>
        </tr>
      </table>
      ${accessLine}
      <p style="color:#555;">Changed your mind? Current plans and pricing are always available at <a href="${FRONTEND}/pricing" style="color:${BRAND};">certshack.com/pricing</a>.</p>`
  }

  const { html, text } = await renderEmail({ title: 'Subscription cancelled', body: bodyHtml })
  await sendHtml({ from: FROM, to: params.to, cc: [TO], subject, html, text })
}

/**
 * Subscription changed — sent when the customer upgrades or downgrades their plan.
 */
export async function sendSubscriptionChangedEmail(params: {
  to: string
  name: string
  userId: string
  fromLabel: string
  fromId: string
  toLabel: string
  toId: string
  isUpgrade: boolean
  effectiveDate?: string | null
}): Promise<void> {
  const stored = await getTemplate('subscription-changed')
  let subject = stored?.subject || `Your certshack plan has been ${params.isUpgrade ? 'upgraded' : 'downgraded'}`
  const vars = { name: params.name || 'there', frontendUrl: FRONTEND, fromLabel: params.fromLabel, toLabel: params.toLabel }
  let bodyHtml: string

  if (stored?.htmlBody) {
    bodyHtml = interpolate(stored.htmlBody, vars)
    subject = interpolate(subject, vars)
  } else {
    const effectiveLine = params.isUpgrade
      ? `<p style="color:#555;">Your new plan is active immediately.</p>`
      : params.effectiveDate
        ? `<p style="color:#555;">Your plan will change on <strong>${new Date(params.effectiveDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>. You retain <strong>${params.fromLabel}</strong> access until then.</p>`
        : `<p style="color:#555;">Your plan change will take effect at the next billing cycle.</p>`
    bodyHtml = `
      <p style="font-size:16px;color:#333;">Hi ${vars.name},</p>
      <p style="color:#555;">Your subscription plan has been ${params.isUpgrade ? 'upgraded' : 'downgraded'}.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <th style="text-align:left;padding:8px 0;border-bottom:2px solid #FF6B35;color:#333;width:80px;"></th>
          <th style="text-align:left;padding:8px 0;border-bottom:2px solid #FF6B35;color:#333;">Plan</th>
          <th style="text-align:left;padding:8px 0;border-bottom:2px solid #FF6B35;color:#333;">Code</th>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;color:#999;font-size:13px;">Previous</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;">${params.fromLabel}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;font-family:monospace;font-size:11px;color:#999;">${params.fromId}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#999;font-size:13px;">New</td>
          <td style="padding:8px 0;color:#333;font-weight:bold;">${params.toLabel}</td>
          <td style="padding:8px 0;font-family:monospace;font-size:11px;color:#999;">${params.toId}</td>
        </tr>
      </table>
      ${effectiveLine}
      <p style="margin:32px 0;">
        <a href="${FRONTEND}" style="background:${BRAND};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;">
          Start learning
        </a>
      </p>`
  }

  const { html, text } = await renderEmail({ title: `Plan ${params.isUpgrade ? 'upgraded' : 'downgraded'}`, body: bodyHtml })
  await sendHtml({ from: FROM, to: params.to, cc: [TO], subject, html, text })
}

/**
 * Subscription ended — sent when a subscription is deleted (period end or payment failure).
 * Distinct from "cancelled" which is the immediate confirmation; this fires when access is revoked.
 */
export async function sendSubscriptionEndedEmail(params: {
  to: string
  name: string
  userId: string
  productLabel: string
  productId: string
}): Promise<void> {
  const stored = await getTemplate('subscription-ended')
  let subject = stored?.subject || 'Your certshack subscription has ended'
  const vars = { name: params.name || 'there', frontendUrl: FRONTEND, productLabel: params.productLabel, productId: params.productId }
  let bodyHtml: string

  if (stored?.htmlBody) {
    bodyHtml = interpolate(stored.htmlBody, vars)
    subject = interpolate(subject, vars)
  } else {
    bodyHtml = `
      <p style="font-size:16px;color:#333;">Hi ${vars.name},</p>
      <p style="color:#555;">Your <strong>${params.productLabel}</strong> subscription has now ended and your access has been removed.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #eee;border-radius:6px;">
        <tr>
          <td style="padding:12px 16px;background:#f9f9f9;border-radius:6px;">
            <span style="color:#333;font-weight:bold;">${params.productLabel}</span>
            <span style="font-size:11px;font-family:monospace;color:#999;margin-left:8px;">${params.productId}</span>
          </td>
        </tr>
      </table>
      <p style="color:#555;">Thank you for being a certshack customer. If you'd like to come back in the future, current plans and pricing are always available at <a href="${FRONTEND}/pricing" style="color:${BRAND};">certshack.com/pricing</a>.</p>`
  }

  const { html, text } = await renderEmail({ title: 'Subscription ended', body: bodyHtml })
  await sendHtml({ from: FROM, to: params.to, cc: [TO], subject, html, text })
}

/**
 * Marketing email — sent in bulk from outreach@certshack.com.
 * The caller provides rendered HTML/subject (already substituted).
 * `userId` is needed to embed the unsubscribe token.
 */
export async function sendMarketingEmail(params: {
  to: string
  userId: string
  name?: string
  subject: string
  htmlBody: string
}): Promise<void> {
  const vars: Record<string, string> = { name: params.name || 'there', frontendUrl: FRONTEND }
  const bodyHtml = interpolate(params.htmlBody, vars)
  const { html, text } = await renderEmail({
    title: params.subject,
    body: bodyHtml,
    userId: params.userId,
    isMarketing: true,
  })
  await sendHtml({ from: OUTREACH, to: params.to, subject: params.subject, html, text })
}

export interface IssueReportPayload {
  reporterName: string
  reporterEmail: string
  contentType: 'question' | 'answer' | 'explanation' | 'lab'
  contentId: string
  examCode?: string
  issueType?: string
  description: string
}

export async function sendIssueReportEmail(p: IssueReportPayload): Promise<void> {
  const subject = `[certshack] ${p.contentType} issue - ${p.examCode ?? p.contentId}`
  const body = [
    `Reporter:     ${p.reporterName} <${p.reporterEmail}>`,
    `Content Type: ${p.contentType}`,
    `Content ID:   ${p.contentId}`,
    `Exam Code:    ${p.examCode ?? 'N/A'}`,
    `Issue Type:   ${p.issueType ?? 'N/A'}`,
    ``,
    `Description:`,
    p.description,
  ].join('\n')

  await ses.send(new SendEmailCommand({
    Source: FROM,
    Destination: { ToAddresses: [TO] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Text: { Data: body, Charset: 'UTF-8' } },
    },
  }))
}

export async function sendGeneralFeedbackEmail(p: {
  senderName: string
  senderEmail: string
  category?: string
  message: string
}): Promise<void> {
  const subject = `[certshack] User feedback${p.category ? ` — ${p.category}` : ''}`
  const body = [
    `From:     ${p.senderName} <${p.senderEmail}>`,
    `Category: ${p.category ?? 'N/A'}`,
    ``,
    `Message:`,
    p.message,
  ].join('\n')

  await ses.send(new SendEmailCommand({
    Source: FROM,
    Destination: { ToAddresses: [TO] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Text: { Data: body, Charset: 'UTF-8' } },
    },
  }))
}

export interface ErasureReceiptPayload {
  receiptId: string
  deletedAt: string
  adminId: string
  targetUserId: string
  targetEmail: string
  targetName: string
  steps: { name: string; status: 'ok' | 'error'; count: number; detail?: string }[]
  allOk: boolean
}

export async function sendErasureReceiptEmail(r: ErasureReceiptPayload): Promise<void> {
  const subject = `[certshack] GDPR Erasure Receipt — ${r.targetEmail}`
  const stepLines = r.steps.map((s) => {
    const tick = s.status === 'ok' ? '✓' : '✗'
    const detail = s.detail ? `  (${s.detail})` : ''
    return `  ${tick}  ${s.name.padEnd(36)} ${s.count} record${s.count !== 1 ? 's' : ''}${detail}`
  })

  const body = [
    'certshack — GDPR Erasure Receipt',
    '='.repeat(50),
    '',
    `Receipt ID:    ${r.receiptId}`,
    `Deleted at:    ${r.deletedAt}`,
    `Admin:         ${r.adminId}`,
    `User ID:       ${r.targetUserId}`,
    `User name:     ${r.targetName}`,
    `User email:    ${r.targetEmail}`,
    '',
    'Erasure steps:',
    '-'.repeat(50),
    ...stepLines,
    `  –  ${'Aggregate metrics (examapp-metrics)'.padEnd(36)} kept — not personal data`,
    '-'.repeat(50),
    '',
    `Result: ${r.allOk ? 'ALL STEPS COMPLETED SUCCESSFULLY' : 'ONE OR MORE STEPS FAILED — check audit log'}`,
    '',
    'This receipt is also stored permanently in the examapp-audit table.',
    'Forward this email to the data subject as evidence of erasure.',
  ].join('\n')

  await ses.send(new SendEmailCommand({
    Source: FROM,
    Destination: { ToAddresses: [TO] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Text: { Data: body, Charset: 'UTF-8' } },
    },
  }))
}

/**
 * Refund processed — sent when an entitlement is revoked following a refund.
 */
export async function sendRefundedEmail(params: {
  to: string
  name: string
  userId: string
  productLabel: string
  productId: string
  source: 'stripe' | 'paypal'
}): Promise<void> {
  const stored = await getTemplate('refund-processed')
  let subject = stored?.subject || 'Your certshack refund has been processed'
  const vars = { name: params.name || 'there', frontendUrl: FRONTEND, productLabel: params.productLabel, productId: params.productId }
  let bodyHtml: string

  if (stored?.htmlBody) {
    bodyHtml = interpolate(stored.htmlBody, vars)
    subject = interpolate(subject, vars)
  } else {
    bodyHtml = `
      <p style="font-size:16px;color:#333;">Hi ${vars.name},</p>
      <p style="color:#555;">We've processed your refund. Your access to the following has been removed:</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #eee;border-radius:6px;">
        <tr>
          <td style="padding:12px 16px;background:#f9f9f9;border-radius:6px;">
            <span style="color:#333;font-weight:bold;">${params.productLabel}</span>
            <span style="font-size:11px;font-family:monospace;color:#999;margin-left:8px;">${params.productId}</span>
          </td>
        </tr>
      </table>
      <p style="color:#555;">The refund will return to your original payment method within 5–10 business days depending on your bank or payment provider.</p>
      <p style="color:#555;">If you have any questions or believe this is an error, please reply to this email or contact us at <a href="mailto:support@certshack.com" style="color:${BRAND};">support@certshack.com</a>.</p>
      <p style="color:#555;">You're welcome back any time.</p>
      <p style="margin:32px 0;">
        <a href="${FRONTEND}/pricing" style="background:${BRAND};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;">
          View plans
        </a>
      </p>`
  }

  const { html, text } = await renderEmail({ title: 'Refund processed', body: bodyHtml })
  await sendHtml({ from: FROM, to: params.to, cc: [TO], subject, html, text })
}

/**
 * Internal ops alert — plain-text notification from noreply to support@certshack.com.
 * Fire-and-forget: never throws so it can't break the main request path.
 */
export async function sendInternalAlert(params: {
  subject: string
  lines: string[]
}): Promise<void> {
  const body = params.lines.join('\n')
  ses.send(new SendEmailCommand({
    Source: FROM,
    Destination: { ToAddresses: [TO] },
    Message: {
      Subject: { Data: params.subject, Charset: 'UTF-8' },
      Body: { Text: { Data: body, Charset: 'UTF-8' } },
    },
  })).catch((err: any) => console.warn('[ses] sendInternalAlert failed', err?.message))
}

// Future: auto-raise GitHub issue
// export async function createGitHubIssue(p: IssueReportPayload): Promise<void> {
//   const token = process.env.GITHUB_TOKEN
//   if (!token) return
//   await fetch('https://api.github.com/repos/garinhughes/examapp/issues', {
//     method: 'POST',
//     headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       title: `[Issue Report] ${p.contentType}: ${p.contentId}`,
//       body: `**Reporter:** ${p.reporterName} <${p.reporterEmail}>\n\n${p.description}`,
//       labels: ['content-issue'],
//     }),
//   })
// }
