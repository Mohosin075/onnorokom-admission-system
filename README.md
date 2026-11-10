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

The app does not seed example classes or admissions. Use **Create Class (Admin)** in the UI to create each class/shift with its own seat capacity.

## Assignment flow

1. Enter the student's **17-digit birth registration number** in the header. No login or email verification is needed.
2. Click **Apply Now** for a class. A successful application immediately holds one seat and shows a countdown.
3. Click **Pay Admission Fee** to simulate payment and confirm admission. No money is charged.
4. **Cancel** releases an unconfirmed reservation. When the timer expires, the seat becomes available automatically and the payment button is disabled.
5. **My Applications** shows this student's held, confirmed, expired and cancelled applications. Refreshing or reopening the browser restores the selected identity and application through localStorage and server history.

Seat counts refresh every three seconds. Application/history views poll every four seconds, while the local countdown updates every second. The server decides expiry and capacity.

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

An optional second API process can share the same PostgreSQL database:

```sh
docker compose -f docker-compose.yml -f docker-compose.concurrency.yml up --build --wait
```

It is reachable at http://localhost:8081. For an **isolated/disposable** stack, an optional Python 3 verifier exercises all eight admission endpoints and sends 30 concurrent HTTP reservation requests across both API processes for five seats:

```sh
python scripts/verify-assessment.py --exercise --secondary-api http://localhost:8081
docker compose -f docker-compose.yml -f docker-compose.concurrency.yml down
docker compose -f docker-compose.yml -f docker-compose.concurrency.yml up --wait
python scripts/verify-assessment.py --verify-persistence --secondary-api http://localhost:8081
```

`--exercise` explicitly creates fixture admissions; use it only on a disposable database. The persistence check retrieves the same saved confirmed application after restart. `python scripts/smoke.py` is a separate read-only health/identity check that creates no records. Python is optional for these extra checks, not needed to run the application or Docker test suites. CI runs the HTTP/concurrency verifier and the restart/persistence check.

## Project structure and optional portal

`backend/` contains Domain, Application, Infrastructure and API projects plus automated tests. `frontend/` contains the React app and frontend tests. Design assumptions are in `ASSUMPTIONS.md`; AI assistance and verification are documented in `AI_USAGE.md`.

The later authenticated portal is retained separately as an optional mode. It does not change the default assignment flow or expose its login, review, payment or document routes in Assessment mode. Setting `APPLICATION_MODE=Portal` selects its backend and frontend build; it requires its own account/provider configuration and a longer hold window. The production Compose overlay explicitly selects Portal mode; see [PRODUCTION.md](PRODUCTION.md). No real email/SMS/Stripe integration is invoked by the default assignment workflow.
