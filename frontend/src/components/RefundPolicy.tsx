import { Helmet } from 'react-helmet-async'

export default function RefundPolicy() {
  return (
    <>
      <Helmet>
        <title>certshack | Refund Policy</title>
        <meta name="description" content="Read the CertShack refund policy for digital content purchases." />
        <link rel="canonical" href="https://certshack.com/refund" />
      </Helmet>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-extrabold mb-2">Refund Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: March 2025</p>

        <div className="space-y-8 text-foreground">

          <section>
            <h2 className="text-lg font-bold mb-2">1. Digital content and your right to cancel</h2>
            <p className="text-muted-foreground leading-relaxed">
              Under the UK Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013,
              you ordinarily have a 14-day right to cancel a digital purchase. However, this right is lost once you
              begin accessing the digital content - which for certshack.com means as soon as you start a practice
              exam or open a skill lab after purchase.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              At checkout you will be asked to confirm that you consent to immediate access to the content and
              understand that this waives your 14-day cancellation right. If you do not consent, do not complete
              the purchase.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">2. Exam Passes and Exam Packs (one-off purchases)</h2>
            <p className="text-muted-foreground leading-relaxed">
              Once you have accessed the content associated with an Exam Pass or Exam Pack (i.e. started a practice
              exam or viewed questions), no refund is available.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              If you purchase and <strong>have not accessed any content</strong> within 14 days of purchase, you may
              request a full refund by contacting us at{' '}
              <a href="mailto:support@certshack.com" className="text-primary underline">support@certshack.com</a> within
              that 14-day window. We will verify access records before processing a refund.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">3. Subscriptions (monthly and annual)</h2>
            <p className="text-muted-foreground leading-relaxed">
              You may cancel your subscription at any time to stop future billing. Cancellation takes effect at the
              end of the current billing period - you retain full access until then.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              <strong>Monthly subscriptions:</strong> No partial refunds are issued for unused days within a billing
              month. If you have not accessed the Service at all in the current billing period, contact us within 7
              days of the renewal charge and we will assess your request on a case-by-case basis.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              <strong>Annual subscriptions:</strong> If you cancel within 14 days of your initial annual purchase and
              have not accessed any content, you are entitled to a full refund. After 14 days or after accessing
              content, no refund is issued for the unused portion of the annual period.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">4. Faulty or inaccessible content</h2>
            <p className="text-muted-foreground leading-relaxed">
              If content you have paid for is materially broken or inaccessible for an extended period (more than 48
              hours of continuous unavailability) and we are unable to resolve it, you may be entitled to a partial or
              full refund at our discretion. Contact us at{' '}
              <a href="mailto:support@certshack.com" className="text-primary underline">support@certshack.com</a> with
              details of the issue.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">5. Duplicate purchases</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you accidentally purchase the same product twice, contact us promptly at{' '}
              <a href="mailto:support@certshack.com" className="text-primary underline">support@certshack.com</a> and
              we will refund the duplicate charge in full.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">6. How refunds are processed</h2>
            <p className="text-muted-foreground leading-relaxed">
              Approved refunds are returned to your original payment method:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground mt-2">
              <li><strong>GoCardless (Direct Debit):</strong> refunds typically appear within 3–5 business days</li>
              <li><strong>PayPal:</strong> refunds typically appear within 3–5 business days, depending on your
                funding source</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              We will notify you by email once a refund has been initiated.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">7. Chargebacks</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you raise a chargeback with your bank or payment provider without first contacting us, we reserve the
              right to suspend your account pending investigation. We encourage you to contact us first - we will work
              to resolve any genuine issue promptly.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">8. Contact us</h2>
            <p className="text-muted-foreground leading-relaxed">
              To request a refund or ask a question about your purchase, email us at{' '}
              <a href="mailto:support@certshack.com" className="text-primary underline">support@certshack.com</a>.
              Please include your account email address and the date of purchase.
            </p>
          </section>

        </div>

      </div>
    </>
  )
}
