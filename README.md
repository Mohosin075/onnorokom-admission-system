# Admission portal

.NET 8, PostgreSQL, React and TypeScript admission system with account authentication, document review and live Stripe Checkout.

The application starts empty by default. There are no sample classes, test payments or seeded admissions. The old assessment database volume is preserved separately; the portal uses the new `portal_data` volume and `admission_portal` database.

Optional local preview accounts can be enabled explicitly using `DEMO_ACCOUNTS_ENABLED=true` and a strong `DEMO_ACCOUNTS_PASSWORD`. This creates `admin@demo.invalid` and `student@demo.invalid` in Development only, without applicant details, classes, documents or payments. The currently requested local credentials are stored in the ignored `.local/DEMO-ACCOUNTS.md`. Production disables bootstrap and rejects `.invalid` account logins and sessions even if the local database is reused.

## Local startup

1. Copy `.env.example` to `.env` if `.env` does not already exist.
2. Set a strong random `POSTGRES_PASSWORD`.
3. Supply the actual institution name and first administrator email/password. New passwords must contain 6–8 characters, including letters and numbers. Existing accounts can still sign in with their original passwords. No administrator is created when these settings are absent.
4. Configure authenticated SMTP to enable applicant registration and verification emails.
5. Run `docker compose up --build -d --wait`.

Open http://localhost:3000. Swagger is available at http://localhost:8080/swagger in Development only. Local ports bind to loopback. Production deployment is described in [PRODUCTION.md](PRODUCTION.md).

## Applicant workflow

- Register with your email and password; follow the emailed verification link, then sign in.
- Open **Profile & documents** to save applicant name, birth registration, date of birth, guardian, mobile number and address, then upload documents on the same page.
- Upload birth certificate and photograph as PNG/JPEG images, maximum 5 MB each. An academic record is optional.
- Choose a class and submit the application with your profile and uploaded documents. Documents do **not** need prior approval. The application enters `PendingReview`; no seat is held and no payment timer runs during review.
- Admissions staff open **Application review** to see the selected class, application reference, submitted applicant/guardian details and document previews together. Approval requires acknowledging inspection of both the birth certificate and photograph. **Request corrections** and **Reject** require written feedback.
- A correction request appears in **My applications**. Edit the profile or upload replacement documents and resubmit. Resubmission increments the application version; a decision against an outdated version is rejected. New uploads are immutable versions and cannot silently replace a document in an already submitted application. Prior correction feedback remains visible during the next review.
- Applicant identity is locked while an application is pending or approved, and after a reservation exists. A correction request unlocks identity editing if there is no other pending/approved application or reservation. Private document downloads and previews are restricted to the owner and administrators.
- Approved applicants choose **Reserve & pay** to reserve an available class seat. Approval does not guarantee capacity: first-come, first-served allocation happens at reservation. Default hold duration is 35 minutes; open Stripe Checkout within the first four minutes. Stripe Checkout itself expires 30 minutes after payment initiation.
- Pay through live Stripe Checkout. Only a signed webhook, followed by a server-to-server paid-status, currency, amount and transaction check, can confirm admission. A return URL never confirms payment.
- Payment for an expired/cancelled hold triggers an idempotent refund rather than reallocating the seat. Refund failures remain visible for administrative retry.
- Download the payment receipt and admission card after confirmation. Downloads are server-generated HTML documents that can be printed or saved as PDF through the browser. The admission card confirms admission; no exam schedule or examination admit card is invented.
- Review application history. Holds can be cancelled before checkout is opened. Once checkout exists, wait for payment completion or hold expiry.

Birth registration ownership is checked by admissions staff against uploaded documents; there is no claim of government registry verification.

## Administration

The actual administrator configured through environment settings signs in through the same portal. The server enforces the Admin role for class creation, fees, document reviews, reports, application search, notification retries, refund retries and audit records. Student input or headers cannot grant administrative access or select another identity.

The dashboard shows real applicant/application counts, active reservations, confirmed seats, collected BDT fees, application review backlog and provider configuration status. Application search supports name, email, birth registration, reference, class, review status and pagination. Recent payments, notification delivery attempts and administrative audit history are available in separate tabs. Standalone document approval has been retired; documents are reviewed in the context of their submitted application.

Existing reservations and paid admissions remain intact after the workflow migration and are shown under **Seat reservations & payments**. Previously uploaded documents remain available for new submissions; the migration does not fabricate application decisions for historical reservations.

## Verification

```sh
docker compose --profile test run --build --rm tests
docker compose --profile test run --build --rm frontend-tests
docker compose --profile test run --rm frontend-tests npm run lint -- --deny-warnings
python scripts/smoke.py
```

Backend integration tests create and remove uniquely named `school_admission_tests_*` databases. Test-only transport substitutions exercise signed Stripe callbacks, duplicate delivery, wrong amounts and late-payment refunds without contacting Stripe or writing transactions to the live application database. Unit tests and frontend tests use isolated fixtures. The public smoke check is read-only and never creates sample classes or applicants.

The repository does not contain provider credentials. Live money movement, SMTP/SMS delivery, real-domain TLS and off-machine backups must be commissioned against the institution's own accounts before launch. Configuration flags indicate supplied settings, not a completed delivery or payment test.
