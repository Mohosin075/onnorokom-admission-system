# Reservation load verification

Measured locally on 11 November 2026 with Docker reporting 12 CPUs and about 7.64 GiB memory. The load generator and servers shared the machine; the normal application remained running. Results describe this environment, not a guarantee for other hardware or complete browser sessions.

## Final acceptance runs

Each case created a fresh five-seat class, warmed the API separately, then dispatched 10,000 unique-student reservation POSTs in one burst without retries. The client deadline remained 10 seconds. All final cases returned exactly **5 HTTP 201 holds and 9995 HTTP 409 conflicts**, with **zero client timeouts, connection resets or unexpected HTTP responses**. Final capacity remained five held seats, zero confirmed, zero available.

- **Single API:** 6.297 seconds from burst start to completion; response p95 5.636 seconds, p99 6.079 seconds, maximum 6.228 seconds. Raw result: `.local/load-tests/final-single-api-10000-10s.json`.
- **Frontend Nginx proxy, single API:** 4.888 seconds; response p95 4.551 seconds, p99 4.640 seconds, maximum 4.678 seconds. Raw result: `.local/load-tests/final-documented-proxy-10000-10s.json`.
- **Two API processes sharing PostgreSQL:** 6.971 seconds; response p95 6.354 seconds, p99 6.699 seconds, maximum 6.785 seconds. Raw result: `.local/load-tests/final-two-apis-10000-10s.json`.

The documented proxy and two-process runs used `docker-compose.load-test.yml` and `--assert yes`, which exits unsuccessfully on capacity violations, unexpected responses, client errors or missed per-request deadlines. Request dispatch took approximately 0.36–0.39 seconds; attempts were concurrent, rather than an assertion that all packets reached the server at precisely the same instant. Two APIs were addressed independently; this does not test a production load balancer.

## Before the changes

The controlled single-API baseline produced 5 holds, 3674 conflicts and 6321 client timeouts at the same ten-second deadline. The baseline frontend proxy produced 5 holds, 4334 conflicts, 1411 timeouts and 4250 connection resets. With a 60-second client deadline, the old single API still returned 787 HTTP 500 responses due to database pool exhaustion. Two processes could also exhaust PostgreSQL's connection limit. These measurements are retained under `.local/load-tests/baseline-*.json`.

## Changes and correctness checks

- A single parameterized read rejects full classes and duplicates before opening a reservation transaction. Positive reads are checked again after acquiring the PostgreSQL class-row lock. No stale full-class cache is used.
- The duplicate and occupancy check shares one database round trip. The existing transaction, ownership checks, confirmation idempotency and automatic expiry remain in place. No schema migration or data reset was required.
- Each API defaults to a 40-connection pool, while respecting explicit connection-string overrides. The optional two-process setup budgets 80 connections against PostgreSQL's default 100.
- Nginx uses 8192 connections per worker and a 65535 open-file limit. Client cancellations stop database work without generating internal-server-error responses; transient database capacity failures have a retryable, non-sensitive 503 response.
- **48 backend tests passed, zero skipped**, including PostgreSQL concurrency, ownership, expiry, migration adoption, cancellation visibility between hosts, rejection of full classes while the class row is locked, connection-pool overrides and cancellation/error handling.
- **51 frontend tests passed**. All eight required endpoints also passed exact JSON field, header and success-code checks through the frontend proxy.
- Mixed held/confirmed capacity and 30 simultaneous confirmations were checked across independent API containers. A confirmed admission survived a complete Docker down/up. Normal application row totals matched before and after deploying the updated containers, and public health/API smoke checks and `nginx -t` passed.

## Reproduce and interpret

Use the Docker-only commands in README.md. They use their own disposable database and never the normal app volume. Raw JSON is intentionally kept in ignored `.local/load-tests/`; the generator and Compose configuration are tracked.

This test covers concurrent reservation attempts. It does not include 10,000 browser renderers, static asset requests, identity lookup/polling traffic, multiple geographic clients, arbitrary database sizes, or a prolonged arrival-rate workload. Repeat the strict test on the evaluator/deployment hardware and adjust the shared connection budget when changing process counts. A larger client timeout was not used to obtain the final passing results.
