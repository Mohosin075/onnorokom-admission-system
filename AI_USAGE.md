# AI usage

The earlier implementation documented use of Antigravity AI for scaffolding,
architecture, database logic, frontend components and initial service tests. This
review did not independently verify that tool's recorded model name or any previous
claims of human corrections.

OpenAI Codex was used for the subsequent requirement audit and fixes: transaction
handling, reservation/confirmation/cancellation synchronization, conditional expiry,
validation, migrations, frontend identity and request handling, tests, Docker setup,
CI and documentation. The user requested these corrections after reviewing the audit.

## Errors found and corrected

- The original InMemory concurrency test serialized calls with its own semaphore.
  It could pass without testing production locking. It was replaced with concurrent
  HTTP requests against real PostgreSQL, including two independent API hosts.
- PostgreSQL automatic retries were enabled alongside direct explicit transactions.
  The incompatible per-command retry configuration was removed.
- Confirmation, cancellation and expiry could overwrite one another's status.
  Class/hold locks and conditional expiry updates now coordinate these changes;
  reads compute effective expiry without saving stale entities.
- The original UI retained a previous student's selected application and a sticky
  local expiry flag. Identity changes now clear selection; application components
  are isolated by identity and hold, and stale asynchronous results are ignored.
- During these fixes, integration-test configuration initially used the application
  connection string instead of its disposable database. The test factory now
  explicitly replaces DbContext options. No existing application database was changed.
- The first frontend test dependency installation selected a jsdom version requiring
  a newer Node release. It was replaced with jsdom 26.1.0 and the regression suite ran.
- A real HTTP smoke run exposed Windows Event Log permission failures on warning
  logs. Runtime logging now explicitly uses the console, and primary-key row-lock
  queries no longer use an unnecessary unordered FirstOrDefault operation.
- A second review found that polling could repeatedly invalidate slow responses,
  and an old class submission could reset and close a newly opened form. Regression
  tests reproduced both failures before fixes. Polls no longer overlap within a
  view, and each dialog opening has isolated state and ignores results after closure.
  Payment confirmation now updates status from its successful response directly.

## Validation and limits

Validation used .NET 8, PostgreSQL 18 and Node 24: 16 backend tests (including 10
database integration tests), 10 frontend regression tests, a production frontend build
and lint with warnings treated as failures. A local HTTP smoke run used two separate
API processes and verified concurrency, API contracts and persistence after restart.
The EF model also matched its migration snapshot.

Docker was not available locally; Docker build, smoke and Compose restart checks are
defined in CI and can be run using the commands in README.md. Local NuGet restore
metadata retained a warning about unavailable vulnerability-service access; it did
not prevent compilation or tests. Test results should not be interpreted as proof
for arbitrary production traffic or unsynchronized server clocks.
