# AI USAGE REPORT

This document transparently outlines the usage of AI tools during the development of the School Admission System assignment, in accordance with Section 7 of the guidelines.

---

## 1. AI Tools Used & Scope of Work

| AI Tool | Area of Application | Description |
| :--- | :--- | :--- |
| **Antigravity AI (Gemini 3.8 Flash)** | Architecture & Scaffolding | Designed Clean Architecture solution structure, boilerplate scaffolding for .NET 8 projects and React 19 / Vite frontend. |
| **Antigravity AI (Gemini 3.8 Flash)** | Concurrency & Database Logic | Formulated PostgreSQL Row-Level Locking (`SELECT ... FOR UPDATE`) strategy and EF Core transaction handling. |
| **Antigravity AI (Gemini 3.8 Flash)** | Automated Test Suite | Implemented high-concurrency simulation test (30 concurrent workers competing for 5 seats) and unit test scenarios. |

---

## 2. Identified AI Mistakes & Human Corrections

### Issue 1: UI Rule 5.2 Expired Button State
- **AI Initial Output:** When an application hold expired, the AI initially hid the "Pay Admission Fee" button completely and replaced it with a generic "Dismiss" button.
- **Problem:** Requirement 5.2 explicitly specifies: *"মেয়াদ শেষ হলে page reload ছাড়াই আবেদনটি EXPIRED স্ট্যাটাস দেখাবে এবং 'ভর্তি ফি দিন' বাটন অকার্যকর (disabled) হয়ে যাবে।"*
- **Correction:** The frontend code was corrected in `ActiveHoldCard.tsx` to keep the button rendered in the DOM with the explicit HTML attribute `disabled={true}`, styled with disabled CSS classes, and displaying `ভর্তি ফি দিন (মেয়াদ উত্তীর্ণ / Expired)`.

### Issue 2: EF Core In-Memory Transaction Warning in Tests
- **AI Initial Output:** The AI implemented physical transactions (`BeginTransactionAsync()`) across all repositories. When running tests under EF Core In-Memory database, EF Core threw an `InvalidOperationException` because In-Memory store does not support transactions by default.
- **Problem:** Concurrency and hold unit tests failed due to unsupported in-memory transactions.
- **Correction:** Updated `UnitOfWork.cs` to detect the in-memory provider (`Microsoft.EntityFrameworkCore.InMemory`) and return a `NullAsyncDisposable`, while preserving real transactions and row locks when connected to relational PostgreSQL. This enabled all 7 automated tests to pass with 100% green status.

### Issue 3: TypeScript `verbatimModuleSyntax` Type Imports
- **AI Initial Output:** Imported TypeScript interfaces directly using standard `import { ClassItem } from './types'`.
- **Problem:** Vite/TS configured with `verbatimModuleSyntax: true` failed the build with error `TS1484: 'ClassItem' is a type and must be imported using a type-only import`.
- **Correction:** Refactored all type imports to use `import type { ... }`, resolving all build errors.

