import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

const ses = new SESClient({ region: process.env.AWS_REGION || 'eu-west-1' })
const FROM = process.env.SES_FROM_ADDRESS || 'noreply@certshack.com'
const TO = process.env.SES_SUPPORT_ADDRESS || 'support@certshack.com'

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
