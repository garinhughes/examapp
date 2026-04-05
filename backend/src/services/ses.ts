import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { SignJWT } from 'jose'
import { getTemplate } from './emailTemplates.js'

const ses = new SESClient({ region: process.env.AWS_REGION || 'eu-west-1' })
const wrapName = (addr: string) => `"certshack" <${addr}>`
const FROM = wrapName(process.env.SES_FROM_ADDRESS || 'noreply@certshack.com')
const OUTREACH = wrapName(process.env.SES_OUTREACH_ADDRESS || 'outreach@certshack.com')
const TO = process.env.SES_SUPPORT_ADDRESS || 'support@certshack.com'
const FRONTEND = process.env.FRONTEND_ORIGIN || 'https://certshack.com'
const BACKEND = process.env.BACKEND_ORIGIN || 'https://api.certshack.com'

// ── Shared HTML helpers ────────────────────────────────────────────────────

const LOGO_URL = `${FRONTEND}/favicon.png`
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
 * - `title` goes in the orange header band.
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
          <td style="background:${BRAND};padding:24px 32px;">
            <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <tr>
                <td style="padding:0 12px 0 0;vertical-align:middle;">
                  <img src="${LOGO_URL}" alt="certshack" height="36" style="display:block;">
                </td>
                <td style="vertical-align:middle;">
                  <span style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;">certshack</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Heading band -->
        <tr>
          <td style="background:#222;padding:16px 32px;">
            <h1 style="margin:0;font-size:20px;color:#fff;">${opts.title}</h1>
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
  subject: string
  html: string
  text: string
}): Promise<void> {
  await ses.send(new SendEmailCommand({
    Source: opts.from,
    Destination: { ToAddresses: [opts.to] },
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
      <p style="color:#999;font-size:13px;">If you didn't create this account, you can safely ignore this email.</p>`
  }

  const { html, text } = await renderEmail({ title: 'Welcome to certshack!', body: bodyHtml })
  await sendHtml({ from: FROM, to: params.to, subject, html, text })
}

/**
 * Payment confirmed email — sent after a successful one-time or subscription purchase.
 */
export async function sendPaymentConfirmedEmail(params: {
  to: string
  name: string
  userId: string
  products: Array<{ label: string; priceGBP: number }>
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
            <td style="padding:8px 0;border-bottom:1px solid #eee;color:#333;">${p.label}</td>
            <td style="padding:8px 0;border-bottom:1px solid #eee;color:#333;text-align:right;">
              £${(p.priceGBP / 100).toFixed(2)}
            </td>
          </tr>`
      )
      .join('')

    bodyHtml = `
      <p style="font-size:16px;color:#333;">Hi ${vars.name},</p>
      <p style="color:#555;">Thanks for your purchase - your access is now active.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <th style="text-align:left;padding:8px 0;border-bottom:2px solid #FF6B35;color:#333;">Item</th>
          <th style="text-align:right;padding:8px 0;border-bottom:2px solid #FF6B35;color:#333;">Price</th>
        </tr>
        ${rows}
        <tr>
          <td style="padding:12px 0;font-weight:bold;color:#333;">Total</td>
          <td style="padding:12px 0;font-weight:bold;color:#333;text-align:right;">
            £${(params.totalPence / 100).toFixed(2)}
          </td>
        </tr>
      </table>
      <p style="margin:32px 0;">
        <a href="${FRONTEND}" style="background:${BRAND};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;">
          Start learning
        </a>
      </p>`
  }

  const { html, text } = await renderEmail({ title: 'Order confirmed', body: bodyHtml })
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
