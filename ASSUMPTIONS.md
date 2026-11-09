# ASSUMPTIONS & TECHNICAL DECISIONS

This document details the assumptions, interpretations, and architectural decisions made while implementing the School Admission System take-home assignment.

---

## 1. Multi-Process Concurrency & No-Overselling (Bonus Requirement)

### The Challenge:
When multiple backend instances run concurrently against a single shared PostgreSQL database, application-level in-memory locking (such as C# `lock` or `SemaphoreSlim`) is ineffective across process boundaries.

### Our Solution:
1. **Pessimistic Row-Level Locking (`SELECT ... FOR UPDATE`):**
   - When a student initiates a seat reservation (`POST /classes/{classId}/holds`), the backend executes `SELECT * FROM classes WHERE "Id" = @id FOR UPDATE` within an explicit database transaction.
   - PostgreSQL ensures that only one transaction holds the exclusive lock on that specific class record at any given millisecond.
2. **Atomic Invariant Check:**
   - Inside the locked transaction, active held seats (`status = 'HELD' AND expires_at > NOW()`) and confirmed seats (`status = 'CONFIRMED'`) are queried.
   - If `heldSeats + confirmedSeats >= totalSeats`, the transaction is rolled back and a `409 Conflict` response is dispatched.
   - If seats remain, the `seat_holds` record is inserted and the transaction commits, releasing the lock.
3. **Result:**
   - Regardless of whether there is 1 backend instance or 10 parallel instances running across separate ports or Docker containers, overselling is physically and mathematically impossible.

---

## 2. Instant Seat Availability & Auto-Expiry Logic

### Specification Note:
Rule 2 requires that expired holds automatically free up seats without requiring manual API calls.

### Decision:
We implemented a **two-tiered expiry strategy**:
1. **Query-Level Dynamic Evaluation (Real-Time):**
   - Active seat calculations throughout the system strictly enforce the condition `expires_at > UTC NOW()`.
   - The exact millisecond a hold reaches its expiry timestamp, its seat becomes available for incoming applicants in real-time. There is zero delay.
2. **Asynchronous Maintenance Worker (`IHostedService`):**
   - A background service runs every 5 seconds to batch update expired records (`status = 'EXPIRED'`), ensuring database integrity and clean audit trails.

---

## 3. Student Identity & Header Validation

### Decision:
- `X-Student-Id` is required for hold creation, confirmation, hold cancellation, and viewing student-specific application history (`/me/holds`).
- It must be a valid 17-digit numeric string (representing the official Birth Registration Number in Bangladesh).
- If the header is missing or does not meet the 17-digit format on protected endpoints, the API returns `400 Bad Request` with an explanatory message.
- `GET /holds/{holdId}` does not require the header per the specification table, allowing public verification of hold expiration timers.

---

## 4. Idempotent Confirmation & Student Ownership

### Decision:
- When calling `POST /holds/{holdId}/confirm`, the system verifies that the caller's `X-Student-Id` matches the student who initiated the hold.
- If the hold has already been confirmed (`status = 'CONFIRMED'`) by the same student, the endpoint returns `200 OK` with `{ "holdId": "...", "status": "CONFIRMED" }` without re-incrementing seat counts or failing.
- Expired or cancelled holds cannot be confirmed and return `409 Conflict`.

---

## 5. UI Polling & State Restoration

### Decision:
- Per UI Rule 3, the frontend polls `/classes` every 3 seconds to keep seat availability live without manual refreshes.
- Student ID and active hold ID are persisted in the browser's `localStorage`.
- Additionally, if a student inputs their 17-digit ID on a fresh session, the frontend queries `/me/holds` to check for any existing unexpired `HELD` seats and automatically loads the countdown timer.
