# School Admission System — Recruitment Assignment

A robust, cloud-ready, and concurrency-safe School Admission System built for **OnnoRokom Projukti Limited** (Assistant Software Engineer Recruitment).

The system operates strictly on a **First-Come, First-Served** model with high concurrency protection, automated hold expirations, idempotent admission confirmation, and real-time frontend synchronization.

---

## 📌 Tech Stack

- **Backend:** C# (.NET 8 Clean Architecture)
- **Database:** PostgreSQL 16 & Entity Framework Core (with Row-Level Locking `SELECT ... FOR UPDATE`)
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS + Lucide Icons
- **Deployment:** Docker & Docker Compose (Multi-stage build)
- **Testing:** xUnit, FluentAssertions, EF Core In-Memory

---

## 🚀 How to Run the Application with Docker

Make sure Docker and Docker Compose are installed and running on your system.

### 1. Start All Services

From the root directory of the repository, execute:

```bash
docker compose up --build
```

This single command starts:
1. **PostgreSQL Database** on port `5432` with health-check and persistent volume storage.
2. **.NET 8 Backend API** on port `8080`.
3. **React Frontend (Nginx SPA)** on port `3000`.

### 2. Access the Application

- **Frontend Web UI:** [http://localhost:3000](http://localhost:3000)
- **Backend API & Swagger UI:** [http://localhost:8080/swagger](http://localhost:8080/swagger)

---

## 🧪 Running Automated Tests

The test suite includes **7 automated tests**, including **Unit Tests**, **Idempotency Tests**, and the mandatory **High-Concurrency Test** demonstrating that seats can never be oversold.

To run the backend test suite locally:

```bash
cd backend
dotnet test
```

### Test Highlights:
- `CreateHold_UnderHighConcurrency_NeverOversellsSeats`: 30 concurrent requests attempt to claim 5 seats simultaneously. Strictly 5 succeed (`201`), 25 fail with Conflict (`409`), and `heldSeats + confirmedSeats` never exceeds capacity.
- `ConfirmHold_MultipleTimes_IsIdempotentAndReturnsConfirmedStatus`: Verifies duplicate confirmation calls do not increase seat counters or cause errors.
- `CreateHold_WhenStudentAlreadyHasActiveHoldInSameClass_ThrowsConflict`: Enforces single active application per student per class.
- `ConfirmHold_WhenExpired_ThrowsConflict`: Ensures expired holds cannot be confirmed.

---

## 🏗️ Architecture & Concurrency Strategy

The project implements Microsoft's official **Clean Architecture**:

```text
backend/
├── src/
│   ├── SchoolAdmission.Domain/          # Pure C# (Entities, Enums, Exceptions, Repository Interfaces)
│   ├── SchoolAdmission.Application/     # CQRS/Services, DTOs, Validations, Options
│   ├── SchoolAdmission.Infrastructure/  # EF Core, PostgreSQL Npgsql, DbContext, Row Locking, Expiry Background Service
│   └── SchoolAdmission.Api/             # Controllers, Global Exception Handling, Swagger Filters, Program.cs
└── tests/
    └── SchoolAdmission.Tests/           # Concurrency Tests & Unit Tests
```

### How Concurrency & No-Overselling is Guaranteed:
1. **Database Row-Level Locking:** During seat reservation, the backend requests a row lock on the class (`SELECT ... FOR UPDATE`).
2. **Atomic Verification:** The active held seats (`status = HELD` and `expires_at > now`) and confirmed seats are counted inside the transaction. If available seats are zero, a `409 Conflict` is returned immediately.
3. **Multi-Instance Safety:** Even if multiple backend instances run behind a load balancer against the same PostgreSQL database, the row-level lock serializes concurrent seat allocation, mathematically preventing overselling.
4. **Immediate Auto-Expiry:** The system dynamically computes active seats by checking `expires_at > UTC now`. The moment a hold expires, its seat is instantaneously available for new applicants, while a background worker updates the database status asynchronously.

---

## 📁 Repository Structure

```text
.
├── backend/                  # .NET 8 Web API & Clean Architecture Solution
│   ├── src/
│   ├── tests/
│   └── Dockerfile
├── front-end/                # React 19 + TypeScript + Vite Frontend
│   ├── src/
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml        # Orchestrates Database, Backend, and Frontend
├── README.md                 # Project Setup & Execution Guide
├── ASSUMPTIONS.md            # Assumptions & Design Decisions
└── AI_USAGE.md               # Transparency report on AI tool usage
```
