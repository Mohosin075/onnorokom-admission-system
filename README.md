# School Admission System

A first-come, first-served admission application built with .NET 8, PostgreSQL,
React 19, TypeScript and Vite. Each class/shift has its own capacity. Students
reserve seats with a 17-digit birth registration number, simulate payment, cancel
holds and view their application history. No login or payment gateway is required.

## Run with Docker

From the repository root:

```sh
docker compose up --build
```

Open the frontend at **http://localhost:3000**. The API is at
**http://localhost:8080**, Swagger at **http://localhost:8080/swagger**, and readiness
at **http://localhost:8080/health**. Only Docker with Compose is required.

PostgreSQL uses a named volume and is reachable inside the Compose network.
`docker compose down` followed by `docker compose up` preserves admissions.
`docker compose down --volumes` deletes the database; use it only to intentionally
reset local data.

Startup applies versioned EF Core migrations. The initial migration also adopts
the original matching `EnsureCreated` schema without deleting its existing data.
A PostgreSQL advisory lock serializes migrations when API instances start together.
Database initialization failure stops API startup instead of serving a broken app.

## Configuration

- Backend: `ConnectionStrings__DefaultConnection` overrides the PostgreSQL connection
  string. Compose supplies it automatically. There is no in-memory production fallback.
- `HOLD_DURATION_SECONDS`: hold lifetime, default 600 seconds. Set it in the root
  `.env` or shell before starting Compose; for example, 10 for a short expiry demo.
- `VITE_API_URL`: frontend API URL, default `http://localhost:8080`. Compose passes
  this as a build argument. After changing it, run `docker compose up --build`.
  This is the URL the user's browser can reach, not the Compose service hostname.
- For frontend development, copy `front-end/.env.example` to `front-end/.env`.

## Tests using only Docker

```sh
docker compose --profile test run --build --rm tests
docker compose --profile test run --build --rm frontend-tests
docker compose --profile test run --rm frontend-tests npm run lint -- --deny-warnings
```

The backend suite has 6 service tests and 10 real PostgreSQL integration tests.
Integration tests create uniquely named temporary databases and drop only those
databases afterward. The test PostgreSQL user needs permission to create databases.
The frontend suite has 10 regression tests for identity switching, restoration,
expired/new holds, stale responses, slow polling, payment success, background
connection failures and dialog focus/lifecycle.

The backend integration tests verify:

- Two independent API hosts share five seats safely under 30 concurrent HTTP requests:
  exactly five return 201 and the other 25 return 409. No test-side reservation lock is used.
- Concurrent duplicate applications and competing confirmation/cancellation requests.
- Thirty concurrent confirmations remain idempotent across two hosts, and an expiry
  update blocked by an uncommitted confirmation rechecks status after that commit.
- A confirmation waiting on a database lock rechecks expiry before it can succeed.
- Ownership, JSON contracts, idempotency, invalid input, automatic expiry, restart
  persistence and migration from the original schema.

For local development with .NET 8 SDK and a PostgreSQL server, set
`TEST_POSTGRES_CONNECTION` to an administrative connection string, then run
`dotnet test backend/SchoolAdmission.sln`. Without that variable, the 10 database tests
are explicitly skipped, rather than simulated with InMemory.

Frontend development requires Node 22.12+ or a compatible newer release:

```sh
cd front-end
npm ci
npm test
npm run lint
npm run build
npm run dev
```

With the application running, an optional Python 3 smoke test exercises all eight
required endpoints and concurrent reservation against the actual HTTP server:

```sh
python scripts/smoke.py
docker compose down
docker compose up --wait
python scripts/smoke.py --verify-persistence
```

GitHub Actions runs the Docker builds, both test suites, lint, the HTTP smoke test,
and persistence verification after Compose down/up. Docker execution must still be
checked on the target machine or in CI; the local verification used PostgreSQL 18,
.NET 8 and Node 24 without Docker. Local HTTP smoke checks also used two separate
API processes sharing the same database; add `--secondary-api http://localhost:8081`
to the smoke command when a second API process is running on that port.

## Concurrency and structure

Reservation, confirmation and cancellation serialize on the PostgreSQL class row.
Confirmation and cancellation additionally lock the hold row before validating its
current status and expiry. Expiry uses a conditional database update that cannot
replace a confirmed status. Read endpoints compute effective expiry without writing
stale records. Explicit transactions use the non-retrying PostgreSQL strategy; a
retrying strategy must wrap the entire transaction if added later.

`backend/src` contains Domain, Application, Infrastructure and API projects;
`backend/tests` contains service and HTTP integration tests. `front-end/src` contains
the React application and regression tests. Design choices are in `ASSUMPTIONS.md`,
and AI assistance is recorded in `AI_USAGE.md`.
