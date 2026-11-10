# AI assistance

Antigravity AI was recorded as assisting with the initial scaffolding, architecture and service implementation. That earlier tool/model attribution was not independently verified. OpenAI Codex assisted with subsequent source review, concurrency fixes, API/UI implementation, test design, Docker setup and documentation.

Later development added an authenticated portal with document review and Stripe payments. A review against the original PDF found that those requested product extensions had replaced the required assignment contract. Codex restored the no-login/header-identity/immediate-hold/simulated-payment workflow as the default, retained the portal in a separately selected mode, restored HTTP contract tests, and renamed the frontend directory to `frontend/`.

## Mistakes identified and corrected

- The initial InMemory concurrency test serialized requests using a test-side semaphore. Real PostgreSQL tests and simultaneous HTTP requests now exercise the database locking itself.
- Automatic per-command PostgreSQL retries conflicted with explicit transactions; the non-retrying transaction strategy was restored.
- Confirmation, cancellation and expiry could overwrite one another. Class/hold locks, conditional expiry updates and read-side effective status now coordinate these changes.
- Earlier frontend identity changes and slow/stale polling responses could retain another student's selection or lose newer state. Components are isolated by identity/hold, stale results are ignored, and polls within a view do not overlap.
- An early integration-test configuration pointed at the application connection; test factories now explicitly replace DbContext options with uniquely named disposable databases.
- The enhanced portal's authentication, CSRF, document approval and Stripe confirmation were incompatible with the PDF's exact eight-route contract. Startup now selects one controller surface and middleware flow per mode; default Assessment mode accepts the PDF header and JSON requests without account setup.
- A mode-isolation test run showed that application configuration was applied too late to choose startup services. Test factories now set the mode through host configuration before Program creates the service collection.
- Existing local `.env` requirements, a 35-minute hold default and a hardcoded frontend API build argument prevented a clean evaluator startup. Assessment Compose defaults are now self-contained, use a 600-second hold and forward the frontend URL override.

## Verification and limits

Validation commands are documented in README. The suite includes the assessment's HTTP JSON/status contracts, expired-hold worker behavior without admission endpoint calls, duplicate/ownership/idempotency cases, competing requests across independent hosts, and the optional portal's regression tests. Frontend tests cover identity restoration, timer expiry, simulated payment, slow/stale requests and dialog lifecycle.

Docker builds, PostgreSQL integration tests, frontend tests/build/lint, an isolated fresh startup without `.env`, cross-process HTTP contention and a saved-confirmed-admission restart check are used for verification. Test fixtures and HTTP acceptance data are confined to disposable test databases/stacks; the normal application data is preserved. Exact final results are reported in the task handoff and CI logs rather than freezing historical test counts here.

Browser automation has been unavailable in this session, so visual browser acceptance is not claimed. Tests do not prove correctness for arbitrary traffic or unsynchronized server clocks. No real payment, email or SMS is needed or performed by the default Assessment flow.
