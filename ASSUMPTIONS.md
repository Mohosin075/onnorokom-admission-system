# Assumptions and decisions

- Each named class/shift has independent seat capacity. A student may apply to
  different classes, but may have only one active hold or confirmed admission in
  any particular class. Expired/cancelled applications remain in history and can
  be followed by a new application.
- The assignment deliberately has no login. The 17 ASCII digits in `X-Student-Id`
  identify the student; confirmation and cancellation check ownership. Missing or
  invalid identity returns 400. Public `GET /holds/{holdId}` follows the contract.
- Class names are trimmed, required and limited to 200 characters to match storage.
  Capacity is a positive 32-bit integer. IDs use a full random GUID with a prefix.
- Payment is simulated. Confirming one's valid held application returns 200.
  Repeated confirmation by the same owner returns the same confirmed status.
  Expired/cancelled applications return 409. Confirmed admissions cannot be cancelled.
  Cancelling an unconfirmed application is idempotent; a historical expired hold
  may be explicitly marked cancelled without changing capacity.
- First-come means the order in which requests obtain the database class lock.
  Browser click times and network arrival order cannot be guaranteed across clients.
  No lottery or application-level scheduling queue is used.
- All seat allocation and confirmation decisions use UTC after obtaining database
  locks. Backend machines should have synchronized clocks. Class-row locks work
  across processes sharing the same PostgreSQL database; no in-process mutex is
  required. Confirmation/cancellation lock class first and hold second. This prevents
  delayed confirmation from consuming a seat already released to a new applicant.
- Read endpoints derive EXPIRED once the expiry time has passed and never write
  tracked stale status back to storage. A worker conditionally persists expired
  HELD rows every five seconds; confirmed or cancelled rows cannot be overwritten.
  Seats are reusable at expiry even before the worker runs.
- Explicit transactions use Npgsql's default non-retrying execution strategy.
  Automatic per-command retries are disabled because they are incompatible with
  an unwrapped user transaction. Failed transactions roll back and release locks.
- PostgreSQL is required at runtime. Startup fails if schema initialization fails.
  Versioned migrations and a startup advisory lock support persistent volumes and
  multiple API hosts. The initial migration adopts the original matching schema;
  it is not a general repair mechanism for arbitrarily modified databases.
- Classes poll every three seconds; active status and history poll every four seconds.
  A local one-second timer disables payment and refreshes history at expiry. The server
  remains authoritative. Requests time out after ten seconds and show readable errors.
- Student identity and the selected hold persist in localStorage. New browsers start
  with an empty identity. Changing identity clears the previous selection and ignores
  pending results belonging to the previous student. Valid IDs also restore active
  applications from server history. If browser storage is disabled, the current session
  still works but cannot persist across browser restarts.
- The frontend API URL is compiled into the static bundle. Changing VITE_API_URL
  requires rebuilding the frontend image. Compose keeps PostgreSQL internal so it
  does not conflict with an existing host installation on port 5432.
- Integration tests use disposable databases and two independent API hosts, not two
  separate OS processes. Actual cross-process protection comes from PostgreSQL locks.
  The local HTTP smoke test additionally ran two separate API processes against
  the same temporary PostgreSQL database.
  GitHub Actions additionally exercises the containerized HTTP service and persistence.
