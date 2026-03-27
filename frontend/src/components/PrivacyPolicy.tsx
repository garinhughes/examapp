import { Helmet } from 'react-helmet-async'

export default function PrivacyPolicy() {
  return (
    <>
      <Helmet>
        <title>certshack | Privacy Policy</title>
        <meta name="description" content="Read the certshack privacy policy — how we collect, use, and protect your data." />
        <link rel="canonical" href="https://certshack.com/privacy" />
      </Helmet>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-extrabold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: March 2026</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">

          <section>
            <h2 className="text-lg font-bold mb-2">1. Who we are</h2>
            <p className="text-muted-foreground leading-relaxed">
              certshack.com is operated by <strong>certshack</strong>, a sole trader registered in England and Wales.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              We are the data controller for the personal data collected through this website. If you have any questions
              about how we handle your data, contact us at{' '}
              <a href="mailto:support@certshack.com" className="text-primary underline">support@certshack.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">2. What data we collect and why</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-1">Account information</h3>
                <p className="text-muted-foreground leading-relaxed">
                  When you sign in with Google, we receive your name, email address, and profile picture from Google
                  via AWS Cognito. We use this to identify your account, personalise your experience, and send you
                  service-related emails (e.g. issue report confirmations). Legal basis: performance of a contract.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Exam attempts and progress</h3>
                <p className="text-muted-foreground leading-relaxed">
                  We store your exam attempts, answers, scores, domain breakdowns, and completion timestamps. This
                  powers your analytics dashboard, review sessions, and leaderboard position. Legal basis: performance
                  of a contract; legitimate interests (improving the service).
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Username and leaderboard data</h3>
                <p className="text-muted-foreground leading-relaxed">
                  If you set a display name, it may appear publicly on the leaderboard. You can change or remove your
                  display name at any time in Account Settings. Legal basis: consent.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Certificates</h3>
                <p className="text-muted-foreground leading-relaxed">
                  When you generate a certificate, your display name, passed exams, and completion date are embedded
                  in a signed token used for public verification. Legal basis: performance of a contract.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Issue reports</h3>
                <p className="text-muted-foreground leading-relaxed">
                  If you submit a question report, we store the content of that report (including your account
                  identifier) in our database and send a copy to our support inbox via AWS SES. Legal basis:
                  legitimate interests (maintaining content quality).
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Payment information</h3>
                <p className="text-muted-foreground leading-relaxed">
                  We do not store your payment card or bank details. Payments are processed entirely by GoCardless
                  (Direct Debit) or PayPal. We receive a confirmation of successful payment and store your entitlement
                  (what products you have purchased) in our database. Legal basis: performance of a contract.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Local storage</h3>
                <p className="text-muted-foreground leading-relaxed">
                  We use your browser's local storage to keep your session token (so you stay logged in), your
                  basket contents between visits, and exam-in-progress state. This data stays on your device and is
                  not sent to our servers except as part of normal API requests.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Analytics and session recording</h3>
                <p className="text-muted-foreground leading-relaxed">
                  We use Google Analytics 4 to understand aggregate traffic patterns, and <strong>Microsoft Clarity</strong> to
                  capture how you use and interact with our website through behavioural metrics, heatmaps, and session
                  replay. This helps us improve the platform and understand where users experience difficulty. Website
                  usage data is captured using first and third-party cookies and other tracking technologies to determine
                  the popularity of features and online activity. We also use this information for site optimisation and
                  security purposes. These tools are only activated after you accept cookies via the consent banner.
                  Legal basis: consent.
                </p>
                <p className="text-muted-foreground leading-relaxed mt-2">
                  For more information about how Microsoft collects and uses your data, visit the{' '}
                  <a href="https://www.microsoft.com/privacy/privacystatement" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    Microsoft Privacy Statement
                  </a>.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">3. Who we share your data with</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              We do not sell your personal data. We share it only with the following service providers, strictly to
              operate the platform:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong>Amazon Web Services (AWS)</strong> - infrastructure including Cognito (authentication),
                DynamoDB (data storage), S3 (content), SES (email), ECS (compute), and CloudFront (CDN). Data is
                processed in the EU (eu-west-1, Ireland) and may be replicated within AWS regions.</li>
              <li><strong>Google</strong> - sign-in provider. When you authenticate via "Sign in with Google", Google's
                privacy policy applies to that interaction.</li>
              <li><strong>GoCardless</strong> - Direct Debit payment processing. GoCardless is authorised by the FCA.
                Their privacy policy is available at gocardless.com.</li>
              <li><strong>PayPal</strong> - payment processing for one-time purchases and subscriptions. PayPal's
                privacy policy applies to data you submit to PayPal.</li>
              <li><strong>Microsoft</strong> - we use Microsoft Clarity for session recording and heatmaps (consent-based).
                Microsoft may collect usage data in accordance with the{' '}
                <a href="https://www.microsoft.com/privacy/privacystatement" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Microsoft Privacy Statement
                </a>.
              </li>
              <li><strong>Google</strong> (Analytics) - we use Google Analytics 4 (consent-based) for aggregate traffic
                analysis. Google's privacy policy applies to data collected via GA4.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">4. How long we keep your data</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Account data and exam attempts: retained while your account is active and for 2 years after your
                last login.</li>
              <li>Issue reports: retained for 3 years for audit and quality purposes.</li>
              <li>Payment records (entitlements, not card data): retained for 7 years to meet UK financial record-keeping
                obligations.</li>
              <li>Certificates: the signed token is valid indefinitely; we retain the data embedded in it for the same
                period as account data.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">5. Your rights</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">
              Under UK GDPR, you have the right to:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li><strong>Access</strong> - request a copy of the personal data we hold about you</li>
              <li><strong>Rectification</strong> - ask us to correct inaccurate data</li>
              <li><strong>Erasure</strong> - ask us to delete your account and associated data</li>
              <li><strong>Portability</strong> - receive your data in a machine-readable format</li>
              <li><strong>Restriction</strong> - ask us to limit how we process your data in certain circumstances</li>
              <li><strong>Objection</strong> - object to processing based on legitimate interests</li>
              <li><strong>Withdraw consent</strong> - where processing is based on consent (e.g. leaderboard), you can
                withdraw it at any time</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              To exercise any of these rights, email{' '}
              <a href="mailto:support@certshack.com" className="text-primary underline">support@certshack.com</a>.
              We will respond within 30 days. You also have the right to lodge a complaint with the{' '}
              <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                Information Commissioner's Office (ICO)
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">6. Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use HTTPS for all data in transit, AWS IAM policies to restrict access to our databases, and JWT
              tokens issued by AWS Cognito for authentication. Session tokens are stored in your browser's local storage.
              While we take reasonable precautions, no system is completely secure, and we cannot guarantee absolute
              security of data transmitted over the internet.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">7. Changes to this policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this policy from time to time. Material changes will be communicated by updating the
              "Last updated" date above. Continued use of the service after changes constitutes acceptance of the
              revised policy.
            </p>
          </section>

        </div>

      </div>
    </>
  )
}
