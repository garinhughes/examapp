import { Helmet } from 'react-helmet-async'

export default function RefundPolicy() {
  return (
    <>
      <Helmet>
        <title>certshack | Refund Policy</title>
        <meta name="description" content="Read the certshack refund policy." />
        <link rel="canonical" href="https://certshack.com/refund" />
      </Helmet>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-extrabold mb-2">Refund Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: April 2026</p>

        <div className="space-y-8 text-foreground">

          <section>
            <h2 className="text-lg font-bold mb-2">1. Digital content and your right to cancel</h2>
            <p className="text-muted-foreground leading-relaxed">
              Under the UK Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013,
              you ordinarily have a 14-day right to cancel a digital purchase. However, this right is lost once you
              begin accessing the digital content. For certshack.com, this means as soon as you start a practice
              exam or open a skill lab after purchase.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              At checkout you will be asked to confirm that you consent to immediate access to the content and
              understand that this waives your 14-day cancellation right. If you do not consent, do not complete
              the purchase.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">2. Subscriptions</h2>
            <p className="text-muted-foreground leading-relaxed">
              certshack offers monthly subscriptions (Pro and Pro Plus). You may cancel at any time from your account
              page. Cancellation takes effect at the end of the current billing period. You retain full access until
              then and will not be charged again.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              No partial refunds are issued for unused days within a billing period. If you have not accessed the
              service at all since your most recent renewal and contact us within 7 days of being charged, we will
              assess your request on a case-by-case basis.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">3. Goodwill refunds</h2>
            <p className="text-muted-foreground leading-relaxed">
              Outside of the statutory rights above, we consider refund requests within 7 days of purchase at our
              discretion. To request a refund, email{' '}
              <a href="mailto:support@certshack.com" className="text-primary underline">support@certshack.com</a>{' '}
              with your account email and purchase date. We do not offer in-app self-service refunds.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              When a refund is approved, your access is removed immediately and you will receive a confirmation email.
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
              All refund requests are handled manually via email. We do not offer in-app self-service refunds.
              This allows us to verify the request and prevent abuse.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              Approved refunds are returned to your original payment method:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground mt-2">
              <li><strong>Card (Stripe):</strong> typically 5–10 business days depending on your card issuer</li>
              <li><strong>PayPal:</strong> typically 3–5 business days depending on your funding source</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              You will receive a confirmation email once the refund has been initiated and your access removed.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">7. Chargebacks</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you raise a chargeback with your bank or payment provider without first contacting us, we reserve the
              right to suspend your account pending investigation. We encourage you to contact us first. We will work
              to resolve any genuine issue promptly.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">8. Contact us</h2>
            <p className="text-muted-foreground leading-relaxed">
              To request a refund or ask a question about your purchase, email{' '}
              <a href="mailto:support@certshack.com" className="text-primary underline">support@certshack.com</a>.
              Please include your account email address and the date of purchase.
            </p>
          </section>

        </div>
      </div>
    </>
  )
}
