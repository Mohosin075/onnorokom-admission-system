# School Admission System

PDF assignment implementation: first-come, first-served school admission with C#/.NET 8, PostgreSQL, React 19, TypeScript and Docker.

## Run

From the repository root, with Docker running:

```sh
docker compose up
```

No `.env`, account setup, SMTP service or payment gateway is required. Docker builds the application automatically. Open:

- Frontend: **http://localhost:3000**
- Backend: **http://localhost:8080**
- Swagger: **http://localhost:8080/swagger**
- Health: **http://localhost:8080/health**

The app does not seed example classes or admissions. Open **Admin workspace** and use **Add a class** to create each class/shift with its own seat capacity.

## Assignment flow

The **New student admission** button is always visible in the student header, including while viewing an older application. It opens a blank student-details form, followed by class selection, review, reservation and payment. Starting another student's form clears the local selection without cancelling any earlier reservation or admission; those remain available through **My applications** with the earlier student's number. Saved-history responses do not interrupt a manually started form.

Entering a complete registration number checks existing applications before continuing. A held seat offers **Continue payment**; a confirmed admission offers **View admission** and **Choose another class**. Expired/cancelled applications do not block reapplication. Lookup failures are retryable and prevent proceeding without a check; late responses for an edited number are ignored. A duplicate conflict caused by another browser refreshes this check and offers the existing application instead of asking the user to keep retrying the reservation.

The public **Browse classes** cards always offer **Apply Now** when seats are available, regardless of a previously selected student's admissions. Choosing a class opens the student-details step and keeps the number entered in the header. Use **New student admission** to clear it for another student. Student-specific **View admission** and **Continue payment** actions appear inside enrollment or in **My applications**, rather than replacing the public catalog's application button.

1. Open **Browse classes**, choose a class and click **Apply Now** to start the guided enrollment form. No login or email verification is needed.
2. Enter the student's **17-digit birth registration number** in the page header, before or after selecting a class. The **Student details** step checks this number before continuing to **Review and reserve**. Editing the number does not reserve a seat.
3. Click **Reserve seat and continue**. A successful request immediately holds one seat, starts its countdown and opens the payment step.
4. Click **Pay Admission Fee** to simulate payment and reach **Confirmation**. No money is charged.
5. **Cancel** releases an unconfirmed reservation. When the timer expires, the seat becomes available automatically and the payment button is disabled.
6. **Browse classes** and **My applications** are keyboard-accessible tabs with separate panels, without URL hashes. Enter a birth registration number in the header and open **My applications** to find that student's held, confirmed, expired and cancelled applications. Switching tabs preserves the enrollment step; refreshing or reopening the browser restores the selected identity and reserved application through localStorage and server history. Returning to the catalog keeps an unpaid reservation until its deadline.

Seat counts refresh every three seconds. The selected class is also fetched directly through `GET /classes/{classId}` and refreshed every three seconds in enrollment. Review uses this response for the class name and available seats; reservation waits for a successful class lookup and offers retry on failure. A class-detail refresh failure does not block payment for an already-held seat. Application/history views poll every four seconds, while the local countdown updates every second. The server decides expiry and capacity.

Use **Language / ভাষা** in the header to switch the assessment workspace between English and Bangla. The choice is remembered on this browser. The enrollment form highlights your current step and provides Back/Continue actions; the payment notice makes clear that no money is charged. On phones, application history becomes labelled cards. Failed requests show a retry action instead of claiming there are no classes or applications; previously loaded history remains visible with a warning when refresh fails.

**View admission** opens a modal on the current tab with the confirmed class, student number, application reference and payment status. Close it with Done, the close button, Escape or the backdrop to return to the same view.

## API contract

All request/response bodies use JSON. Student-specific requests use the `X-Student-Id` header containing 17 ASCII digits. The default mode exposes exactly the required admission routes, plus health/Swagger:

```text
POST   /classes
GET    /classes
GET    /classes/{classId}
POST   /classes/{classId}/holds
GET    /holds/{holdId}
POST   /holds/{holdId}/confirm
DELETE /holds/{holdId}
GET    /me/holds
```

Creation returns 201; class/status/history reads and confirmation return 200; successful cancellation returns 204; unavailable seats or invalid state transitions return 409. Missing/invalid student IDs return 400. Ownership is checked on confirmation/cancellation. Confirmation is idempotent. Required response field names match the assignment.

## Optional configuration

Copy `.env.example` to `.env` only when overriding defaults:

- `HOLD_DURATION_SECONDS`: **600** by default. Changing it requires recreating the backend container.
- `DATABASE_MAX_POOL_SIZE`: **40** per API process by default; budget all processes together against the database connection limit. An explicit pool limit in the connection string takes precedence.
- `VITE_API_URL`: frontend backend URL, default `/api` through the same-origin proxy. It is a build-time value: after changing it run `docker compose up --build`. An absolute `http://` or `https://` URL is also supported, and its origin is included in the generated frontend CSP.
- `POSTGRES_PASSWORD`: local assessment default `postgres`. A custom value must also match an existing database user's password if reusing a volume.
- `ConnectionStrings__DefaultConnection`: backend database connection override, forwarded by Compose when supplied. When omitted, Compose supplies its internal PostgreSQL connection automatically. Both API processes use the same override in the optional concurrency setup.

PostgreSQL uses the named `portal_data` volume. `docker compose down` followed by `docker compose up` preserves admissions. `docker compose down --volumes` deletes database/upload volumes and is only for intentionally disposable environments.

## Tests using only Docker

```sh
docker compose --profile test run --build --rm tests
docker compose --profile test run --build --rm frontend-tests
docker compose --profile test run --rm frontend-tests npm run lint -- --deny-warnings
```

The backend suite includes exact unauthenticated HTTP-contract tests, real PostgreSQL concurrency/expiry checks, ownership and idempotency tests, migration adoption, and regression tests for the separately retained portal. Integration fixtures create uniquely named temporary databases and remove only those databases. No test admission is inserted into the normal app database by these suites.

The frontend suite includes identity switching/restoration, expiry, simulated confirmation, stale-response handling, slow polling and dialog lifecycle tests, plus the optional portal's own tests. A production frontend build runs during Docker image creation.

## Cross-process concurrency and restart verification

Admission reads use a fast full-class check, followed by a locked transactional recheck for successful reservations. Pool limits default to 40 connections per API; configure `Database__MaxPoolSize` or an explicit connection-string pool limit when changing the number of processes or PostgreSQL capacity.

Previous local 10,000-request reservation checks returned exactly five holds and 9995 conflicts without client errors at a ten-second deadline, including across two API processes. The servers and load generator shared one machine; these measurements do not represent complete browser sessions or guarantee throughput on other hardware.

An optional second API process can share the same PostgreSQL database:

```sh
docker compose --profile concurrency up --build --wait
```

It is reachable at http://localhost:8081. For an **isolated/disposable** stack, an optional Python 3 verifier exercises all eight admission endpoints and sends 30 concurrent HTTP reservation requests across both API processes for five seats:

```sh
python scripts/verify-assessment.py --exercise --secondary-api http://localhost:8081
docker compose --profile concurrency down
docker compose --profile concurrency up --wait
python scripts/verify-assessment.py --verify-persistence --secondary-api http://localhost:8081
```

`--exercise` explicitly creates fixture admissions; use it only on a disposable database. The persistence check retrieves the same saved confirmed application after restart. `python scripts/smoke.py` is a separate read-only health/identity check that creates no records. Python is optional for these extra checks, not needed to run the application or Docker test suites. CI runs the HTTP/concurrency verifier and the restart/persistence check.

## Project structure and optional portal

`backend/` contains Domain, Application, Infrastructure and API projects plus automated tests. `frontend/` contains the React app and frontend tests. Design assumptions are in `ASSUMPTIONS.md`; AI assistance and verification are documented in `AI_USAGE.md`.

The later authenticated portal is retained separately as an optional mode. It does not change the default assignment flow or expose its login, review, payment or document routes in Assessment mode. For a local portal preview, set `APPLICATION_MODE=Portal` and `HOLD_DURATION_SECONDS=2100`, configure its accounts/providers, and run `docker compose up --build`. Public production deployment is outside this assignment setup. No real email/SMS/Stripe integration is invoked by the default assignment workflow.
