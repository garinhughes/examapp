import { Helmet } from 'react-helmet-async'

export default function TermsOfService() {
  return (
    <>
      <Helmet>
        <title>certshack | Terms of Service</title>
        <meta name="description" content="Read the certshack terms of service governing your use of the platform." />
        <link rel="canonical" href="https://certshack.com/terms" />
      </Helmet>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-extrabold mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: March 2025</p>

        <div className="space-y-8 text-foreground">

          <section>
            <h2 className="text-lg font-bold mb-2">1. About these terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms of Service ("Terms") govern your use of certshack.com ("the Service"), operated by{' '}
              <strong>certshack</strong> ("we", "us", "our"), registered in England and Wales.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              By registering an account or making a purchase, you agree to these Terms. If you do not agree, do not
              use the Service. These Terms are governed by the laws of England and Wales.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">2. Eligibility</h2>
            <p className="text-muted-foreground leading-relaxed">
              You must be at least 18 years old to make a purchase on certshack.com. If you are under 18, you may
              only use the free tier of the Service with the consent of a parent or guardian. By making a purchase,
              you confirm that you are 18 or older.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">3. The Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              certshack.com provides practice exam questions, skill labs, analytics, and related study tools to help
              you prepare for IT certification exams. The Service is a <strong>study aid only</strong>. We make no
              guarantee that using certshack.com will result in passing any certification exam. Exam questions on this
              platform are original practice material and are not leaked, stolen, or copied from official exam banks.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              The Service is provided on a "work in progress" basis. Features may change, be removed, or be temporarily
              unavailable without notice. We will not be liable for any disruption caused by planned or unplanned
              maintenance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">4. Accounts</h2>
            <p className="text-muted-foreground leading-relaxed">
              You sign in using your Google account via AWS Cognito. You are responsible for maintaining the security
              of your Google account. You must not share your account with others. Each purchase grants access to one
              individual account only - account sharing is not permitted and may result in account suspension without
              refund.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">5. Purchases and access</h2>
            <div className="space-y-3 text-muted-foreground">
              <p className="leading-relaxed">
                We offer the following paid products, all priced in GBP:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Exam Passes</strong> - 12 months' access to a single exam's question bank</li>
                <li><strong>Exam Packs</strong> - bundled access to 2 or more exams for 12 months</li>
                <li><strong>All-Access Monthly</strong> - access to all exams and skill labs, billed monthly</li>
                <li><strong>All-Access Annual</strong> - access to all exams and skill labs, billed annually</li>
              </ul>
              <p className="leading-relaxed">
                Prices are inclusive of any applicable VAT. Access is granted to your account immediately upon successful
                payment confirmation.
              </p>
              <p className="leading-relaxed">
                Payments are processed by GoCardless (Direct Debit) or PayPal. By completing a purchase, you agree to
                the respective payment provider's terms.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">6. Subscriptions and cancellation</h2>
            <p className="text-muted-foreground leading-relaxed">
              Monthly and annual subscriptions renew automatically at the end of each billing period. You will be
              charged the same amount unless pricing has changed, in which case we will notify you at least 14 days
              in advance.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              You may cancel your subscription at any time. Cancellation stops future billing; you retain access until
              the end of your current paid period. Cancellations and subscription management must be requested via{' '}
              <a href="mailto:support@certshack.com" className="text-primary underline">support@certshack.com</a> or
              via your payment provider's account portal.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">7. Acceptable use</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">You agree not to:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Share, resell, or redistribute any exam questions, lab content, or certificates from the Service</li>
              <li>Scrape, crawl, or systematically download content from the Service</li>
              <li>Attempt to circumvent access controls, entitlements, or subscription enforcement</li>
              <li>Use the Service to cheat on or reproduce content from real certification exams</li>
              <li>Submit abusive, offensive, or false content in issue reports or usernames</li>
              <li>Use automated tools to interact with the Service in a way that places undue load on our infrastructure</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              Violation of these rules may result in immediate account suspension without refund.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">8. Intellectual property</h2>
            <p className="text-muted-foreground leading-relaxed">
              All content on certshack.com - including exam questions, explanations, lab definitions, diagrams, and
              interface design - is the intellectual property of <strong>certshack</strong> or its licensors.
              Your purchase grants you a personal, non-transferable licence to access and use the content for your own
              study. No content may be copied, reproduced, or distributed without our written permission.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">9. Limitation of liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              To the fullest extent permitted by law, we are not liable for: indirect or consequential losses; loss of
              earnings or opportunity; failure to pass any certification exam; or service downtime. Our total liability
              to you for any claim arising from your use of the Service will not exceed the amount you paid us in the
              12 months preceding the claim.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              Nothing in these Terms excludes or limits our liability for fraud, death or personal injury caused by
              our negligence, or any other liability that cannot be excluded under English law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">10. Changes to the Service and these Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may modify these Terms or the features of the Service at any time. We will notify you of material
              changes to these Terms by updating the "Last updated" date. Continued use of the Service after changes
              constitutes your acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">11. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For any questions about these Terms, contact us at{' '}
              <a href="mailto:support@certshack.com" className="text-primary underline">support@certshack.com</a>.
            </p>
          </section>

        </div>

      </div>
    </>
  )
}
