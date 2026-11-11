# AI usage

OpenAI Codex assisted with code review, backend and frontend implementation, test design, Docker configuration and documentation. AI-generated changes were checked against the assignment, source code and executable tests.

## Corrections made during review

- **Concurrency testing:** An early InMemory test serialized requests with a test-side semaphore, so it did not prove database safety. Reviewing the test exposed this limitation; real PostgreSQL tests and simultaneous requests across independent API processes replaced that approach.
- **Assignment contract:** Comparing an earlier implementation with the assignment exposed authentication requirements and mismatched defaults. The default workflow was corrected to use the required header identity, eight endpoints, simulated payment and 600-second hold.
- **Frontend state:** Regression tests exposed stale responses after identity changes and during slow polling. Responses are now checked against the active student/application, and polls within a view do not overlap.
- **Connection limits:** Load tests exposed pool exhaustion and proxy resets. Query/connection handling and Nginx limits were adjusted. A configuration regression also showed that Npgsql `ContainsKey` recognizes unset options; explicit connection-string keys are now checked separately and covered by tests.

## Verification

Checks included Docker builds, API contract tests, PostgreSQL concurrency and expiry tests, frontend tests/lint, and confirmation persistence after Docker down/up. Commands are in [README.md](README.md). Local load measurements cover reservation requests on the tested machine; they do not guarantee performance on other hardware or for complete browser sessions.
