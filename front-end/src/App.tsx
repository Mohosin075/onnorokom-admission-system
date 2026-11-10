import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  GraduationCap,
  ShieldCheck,
  LogOut,
  ArrowRight,
  RefreshCw,
  FileText,
  BookOpen,
  UserRound,
  LayoutDashboard,
  Search,
  CreditCard,
  Bell,
  Download,
} from "lucide-react";
import {
  base,
  request,
  type Account,
  type ClassRoom,
  type Application,
  type Document,
  type Payment,
  type Overview,
  type RecordRow,
  type AdmissionSubmission,
} from "./services/portal";
import {
  ApplicationDialog,
  StudentSubmissions,
  ReviewQueue,
} from "./components/ApplicationFlow";
import "./portal.css";

const money = (n: number) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT" }).format(
    n,
  );
const err = (e: unknown) => (e instanceof Error ? e.message : "Please retry.");
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Status({ children }: { children: ReactNode }) {
  return (
    <span className={"status status-" + String(children).toLowerCase()}>
      {children}
    </span>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <FileText />
      <p>{children}</p>
    </div>
  );
}
type Act = (task: () => Promise<void>, notice?: string) => Promise<void>;

export default function App() {
  const [account, setAccount] = useState<Account | null>(null),
    [loading, setLoading] = useState(true),
    [name, setName] = useState("");
  useEffect(() => {
    void request<{ institutionName?: string }>("/portal")
      .then((x) => setName(x.institutionName || ""))
      .catch(() => {});
    void request<Account>("/auth/me")
      .then(setAccount)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading)
    return <div className="loading-screen">Connecting to admissions…</div>;
  return (
    <div className="portal">
      <header className="topbar">
        <a href="/" className="brand">
          <span className="brand-icon">
            <GraduationCap />
          </span>
          <span>
            {name || "Admissions"}
            <small>ONLINE ADMISSION PORTAL</small>
          </span>
        </a>
        <div className="topbar-right">
          <span className="secure">
            <ShieldCheck size={16} />
            Secure portal
          </span>
          {account && (
            <button
              className="quiet"
              onClick={async () => {
                await request("/auth/logout", "POST");
                setAccount(null);
              }}
            >
              <LogOut size={16} />
              Sign out
            </button>
          )}
        </div>
      </header>
      {account ? (
        <Workspace account={account} update={setAccount} />
      ) : (
        <Authentication login={setAccount} />
      )}
      <footer className="portal-footer">
        {name || "Admission portal"} · Your records are private and accessible
        through your account.
      </footer>
    </div>
  );
}

function Authentication({ login }: { login: (a: Account) => void }) {
  const params = new URLSearchParams(window.location.search);
  const [mode, setMode] = useState(
      ["verify", "reset"].includes(params.get("action") || "")
        ? params.get("action")!
        : "login",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (mode === "login")
        login(await request<Account>("/auth/login", "POST", values));
      else {
        const path =
          mode === "forgot"
            ? "forgot-password"
            : mode === "resend"
              ? "resend-verification"
              : mode === "reset"
                ? "reset-password"
                : mode;
        const result = await request<{ message: string }>(
          "/auth/" + path,
          "POST",
          { ...values, token: params.get("token") },
        );
        setNotice(result.message);
        if (["verify", "reset"].includes(mode)) {
          setMode("login");
          window.history.replaceState({}, "", "/");
        }
      }
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  }
  const title =
    mode === "login"
      ? "Your next chapter starts here."
      : mode === "register"
        ? "Create your applicant account."
        : mode === "verify"
          ? "Verify your email address."
          : mode === "reset"
            ? "Choose a new password."
            : mode === "resend"
              ? "Request a verification email."
              : "Recover your account.";
  return (
    <main className="auth-layout">
      <section className="auth-intro">
        <span className="eyebrow">A CLEAR PATH TO ADMISSION</span>
        <h1>
          One place.
          <br />
          Every step forward.
        </h1>
        <p>
          Complete your profile, submit your documents and secure your place
          through the institution’s admission portal.
        </p>
        <ol className="journey">
          {[
            ["Your account, your records", "Verify your email to get started."],
            [
              "Apply with confidence",
              "Upload documents for admissions review.",
            ],
            [
              "Make it official",
              "Pay securely and download your admission records.",
            ],
          ].map(([t, p], i) => (
            <li key={t}>
              <span>0{i + 1}</span>
              <div>
                <strong>{t}</strong>
                <p>{p}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="auth-card">
        <span className="eyebrow">APPLICANT ACCESS</span>
        <h2>{title}</h2>
        <p className="muted">
          {mode === "login"
            ? "Sign in to continue your admission journey."
            : "Use your own details to continue."}
        </p>
        {error && (
          <div role="alert" className="alert error">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="alert success">
            {notice}
          </div>
        )}
        <form onSubmit={submit}>
          {!["verify", "reset"].includes(mode) && (
            <Field label="Email address">
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </Field>
          )}
          {["login", "register", "reset"].includes(mode) && (
            <Field label="Password">
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={mode === "login" ? 1 : 12}
                maxLength={128}
                required
              />
            </Field>
          )}
          {["register", "reset"].includes(mode) && (
            <p className="hint">
              At least 12 characters, including letters and numbers.
            </p>
          )}
          <button className="primary wide" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : mode === "register"
                  ? "Create account"
                  : mode === "verify"
                    ? "Verify email"
                    : mode === "reset"
                      ? "Update password"
                      : "Send email"}
            <ArrowRight size={16} />
          </button>
        </form>
        <div className="auth-links">
          {(mode === "login"
            ? [
                ["register", "Create an account"],
                ["forgot", "Forgot password?"],
                ["resend", "Resend verification email"],
              ]
            : [["login", "Back to sign in"]]
          ).map(([id, text]) => (
            <button
              key={id}
              onClick={() => {
                setMode(id);
                setError("");
              }}
            >
              {text}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function Workspace({
  account,
  update,
}: {
  account: Account;
  update: (a: Account) => void;
}) {
  const admin = account.role === "Admin";
  const [tab, setTab] = useState(admin ? "overview" : "classes"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [classes, setClasses] = useState<ClassRoom[]>([]),
    [fees, setFees] = useState<Record<string, number>>({}),
    [applications, setApplications] = useState<Application[]>([]),
    [submissions, setSubmissions] = useState<AdmissionSubmission[]>([]),
    [selectedClass, setSelectedClass] = useState<ClassRoom | null>(null),
    [documents, setDocuments] = useState<Document[]>([]),
    [payments, setPayments] = useState<Payment[]>([]),
    [overview, setOverview] = useState<Overview | null>(null),
    [now, setNow] = useState(() => Date.now());
  const load = useCallback(async () => {
    const [cls, fee] = await Promise.all([
      request<ClassRoom[]>("/classes"),
      request<{ classId: string; amount: number }[]>("/class-fees"),
    ]);
    setClasses(cls);
    setFees(Object.fromEntries(fee.map((x) => [x.classId, x.amount])));
    if (admin) setOverview(await request<Overview>("/admin/overview"));
    else {
      const [a, d, p, s] = await Promise.all([
        request<Application[]>("/me/holds"),
        request<Document[]>("/profile/documents"),
        request<Payment[]>("/payments/mine"),
        request<AdmissionSubmission[]>("/applications/mine"),
      ]);
      setApplications(a);
      setDocuments(d);
      setPayments(p);
      setSubmissions(s);
    }
  }, [admin]);
  useEffect(() => {
    let stopped = false,
      running = false;
    async function tick() {
      if (running || stopped) return;
      running = true;
      try {
        await load();
      } catch (e) {
        if (!stopped) setError(err(e));
      } finally {
        running = false;
      }
    }
    void tick();
    const timer = setInterval(() => void tick(), 5000),
      clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [load]);
  const act: Act = async (task, text) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
      await load();
      if (text) setNotice(text);
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };
  const nav = admin
    ? ([
        ["overview", "Overview", LayoutDashboard],
        ["classes", "Classes & fees", BookOpen],
        ["review", "Application review", ShieldCheck],
        ["search", "Applications", Search],
        ["payments", "Payments", CreditCard],
        ["notifications", "Notifications", Bell],
        ["audit", "Audit log", FileText],
      ] as const)
    : ([
        ["classes", "Available classes", BookOpen],
        ["applications", "My applications", FileText],
        ["profile", "Profile & documents", UserRound],
      ] as const);
  const ready =
    !!account.birthRegistration &&
    ["BirthCertificate", "Photograph"].every((k) =>
      documents.some((d) => d.kind === k),
    );
  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="account">
          <div className="avatar">
            {(account.fullName || account.email)[0].toUpperCase()}
          </div>
          <div>
            <strong>
              {account.fullName || (admin ? "Admissions team" : "Applicant")}
            </strong>
            <small>{account.email}</small>
          </div>
        </div>
        <p className="nav-label">
          {admin ? "ADMINISTRATION" : "YOUR ADMISSION"}
        </p>
        <nav aria-label="Main navigation">
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={tab === id ? "selected" : ""}
              onClick={() => {
                setTab(id);
                setError("");
                setNotice("");
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={20} />
          <p>
            {admin
              ? "Administrative actions are recorded in the audit log."
              : "Use your own details and clear, readable documents."}
          </p>
        </div>
      </aside>
      <main className="main-content">
        <div className="page-heading">
          <div>
            <span className="eyebrow">
              {admin ? "ADMISSIONS MANAGEMENT" : "APPLICANT WORKSPACE"}
            </span>
            <h1>{nav.find((x) => x[0] === tab)?.[1]}</h1>
            <p className="muted">
              {admin
                ? "Manage admissions using the institution’s live records."
                : "Your progress, documents and next steps in one place."}
            </p>
          </div>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void act(load)}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
        {error && (
          <div role="alert" className="alert error">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="alert success">
            {notice}
          </div>
        )}
        {!admin && !ready && tab !== "profile" && (
          <div className="next-step">
            <div>
              <strong>Get ready to apply</strong>
              <p>
                Complete your profile and upload your birth certificate and
                photograph. Admissions reviews them after you submit an
                application.
              </p>
            </div>
            <button className="secondary" onClick={() => setTab("profile")}>
              Continue setup
              <ArrowRight size={16} />
            </button>
          </div>
        )}
        {tab === "overview" && overview && (
          <>
            <div className="stat-grid">
              {[
                ["Applicants", overview.students],
                ["Applications", overview.applications],
                ["Confirmed", overview.confirmed],
                ["Active reservations", overview.activeHolds],
                ["Collected fees", money(overview.revenue)],
                ["Applications to review", overview.pendingApplications],
              ].map(([k, v]) => (
                <article className="stat" key={k}>
                  <p>{k}</p>
                  <strong>{v}</strong>
                </article>
              ))}
            </div>
            <section className="panel">
              <h2>Service connections</h2>
              <p className="muted">
                Connections require credentials supplied by the institution.
              </p>
              <div className="connection-grid">
                {Object.entries(overview.integrations).map(([k, v]) => (
                  <div key={k}>
                    <strong>
                      {k === "stripe"
                        ? "Stripe payments"
                        : k === "email"
                          ? "Email delivery"
                          : "SMS delivery"}
                    </strong>
                    <Status>{v ? "Configured" : "Not configured"}</Status>
                  </div>
                ))}
              </div>
              {overview.refundRequired > 0 && (
                <div className="alert error">
                  {overview.refundRequired} payments need refund attention. Open
                  Payments.
                </div>
              )}
              {overview.failedNotifications > 0 && (
                <p className="muted">
                  {overview.failedNotifications} notifications awaiting
                  delivery.
                </p>
              )}
            </section>
          </>
        )}
        {tab === "classes" && (
          <>
            {admin && (
              <section className="panel">
                <h2>Open a class / shift</h2>
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget,
                      v = new FormData(form);
                    void act(async () => {
                      await request("/admin/classes", "POST", {
                        name: v.get("name"),
                        totalSeats: Number(v.get("seats")),
                        fee: Number(v.get("fee")),
                      });
                      form.reset();
                    }, "Class opened.");
                  }}
                >
                  <Field label="Class / shift name">
                    <input name="name" required maxLength={200} />
                  </Field>
                  <Field label="Seat capacity">
                    <input
                      type="number"
                      name="seats"
                      min={1}
                      max={100000}
                      required
                    />
                  </Field>
                  <Field label="Admission fee (BDT)">
                    <input
                      type="number"
                      name="fee"
                      step="0.01"
                      min={10}
                      max={500000}
                      required
                    />
                  </Field>
                  <button className="primary" disabled={busy}>
                    Open admissions
                  </button>
                </form>
              </section>
            )}
            <section className="panel">
              <div className="section-title">
                <h2>Classes & shifts</h2>
                <span className="live-dot">Live availability</span>
              </div>
              {classes.length === 0 ? (
                <Empty>No admissions have been opened yet.</Empty>
              ) : (
                <div className="class-grid">
                  {classes.map((c) => (
                    <article className="class-card" key={c.id}>
                      <div className="class-icon">
                        <BookOpen />
                      </div>
                      <h3>{c.name}</h3>
                      <p className="fee">
                        {fees[c.id] ? money(fees[c.id]) : "Fee not configured"}
                      </p>
                      <div className="seat-row">
                        <span>
                          Available<strong>{c.availableSeats}</strong>
                        </span>
                        <span>
                          Reserved<strong>{c.heldSeats}</strong>
                        </span>
                        <span>
                          Confirmed<strong>{c.confirmedSeats}</strong>
                        </span>
                      </div>
                      <div className="capacity">
                        <span
                          style={{
                            width:
                              Math.min(
                                100,
                                ((c.heldSeats + c.confirmedSeats) /
                                  c.totalSeats) *
                                  100,
                              ) + "%",
                          }}
                        />
                      </div>
                      <p className="hint">{c.totalSeats} total seats</p>
                      {!admin && (
                        <button
                          className="primary wide"
                          disabled={busy || !fees[c.id]}
                          onClick={() =>
                            submissions.some((a) => a.classId === c.id)
                              ? setTab("applications")
                              : setSelectedClass(c)
                          }
                        >
                          {submissions.some((a) => a.classId === c.id)
                            ? "View application"
                            : "Apply to this class"}
                          <ArrowRight size={16} />
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
        {tab === "profile" && (
          <section className="panel">
            <h2>1. Applicant &amp; guardian details</h2>
            <p className="muted">
              Use your official document details. Name, birth registration and
              date of birth are locked while an application is under review or
              approved. You can correct them if admissions requests changes.
            </p>
            <form
              className="profile-form"
              onSubmit={(e) => {
                e.preventDefault();
                const v = Object.fromEntries(new FormData(e.currentTarget));
                void act(
                  async () =>
                    update(await request<Account>("/profile", "PUT", v)),
                  "Profile saved.",
                );
              }}
            >
              <Field label="Applicant full name">
                <input
                  name="fullName"
                  defaultValue={account.fullName}
                  minLength={2}
                  maxLength={150}
                  required
                />
              </Field>
              <Field label="Birth registration number">
                <input
                  name="birthRegistration"
                  defaultValue={account.birthRegistration}
                  pattern="[0-9]{17}"
                  inputMode="numeric"
                  maxLength={17}
                  required
                />
              </Field>
              <Field label="Date of birth">
                <input
                  name="dateOfBirth"
                  type="date"
                  defaultValue={account.dateOfBirth}
                  max={new Date(now).toISOString().slice(0, 10)}
                  required
                />
              </Field>
              <Field label="Guardian full name">
                <input
                  name="guardianName"
                  defaultValue={account.guardianName}
                  minLength={2}
                  maxLength={150}
                  required
                />
              </Field>
              <Field label="Mobile number">
                <input
                  name="phone"
                  type="tel"
                  defaultValue={account.phone}
                  pattern="(\+?88)?01[3-9][0-9]{8}"
                  required
                />
              </Field>
              <Field label="Residential address">
                <textarea
                  name="address"
                  defaultValue={account.address}
                  minLength={10}
                  maxLength={1000}
                  required
                />
              </Field>
              <div>
                <button className="primary" disabled={busy}>
                  Save admission profile
                </button>
              </div>
            </form>
          </section>
        )}
        {tab === "profile" && (
          <section className="panel">
            <h2>2. Admission documents</h2>
            <p className="muted">
              Readable PNG or JPEG images, up to 5 MB. Upload your birth
              certificate and photograph, then apply to a class. No prior
              document approval is needed. New uploads are used on your next
              submission; existing applications retain their submitted copies.
            </p>
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  v = new FormData(form);
                void act(async () => {
                  await request("/profile/documents", "POST", v);
                  form.reset();
                }, "Document uploaded. Submit or resubmit an application to send it for review.");
              }}
            >
              <Field label="Document type">
                <select name="kind">
                  <option value="BirthCertificate">Birth certificate</option>
                  <option value="Photograph">Photograph</option>
                  <option value="AcademicRecord">Academic record</option>
                </select>
              </Field>
              <Field label="Image file">
                <input
                  name="file"
                  type="file"
                  accept="image/png,image/jpeg"
                  required
                />
              </Field>
              <button
                className="primary"
                disabled={busy || !account.birthRegistration}
              >
                Upload document
              </button>
            </form>
            {!account.birthRegistration && (
              <p className="hint">Save your profile first.</p>
            )}
            <div className="record-list">
              {documents.map((d) => (
                <article key={d.id}>
                  <div>
                    <strong>{d.kind.replace(/([A-Z])/g, " $1").trim()}</strong>
                    <p>{d.originalName}</p>
                    {d.reviewNote && <p>{d.reviewNote}</p>}
                  </div>
                  <Status>{d.reviewStatus}</Status>
                  <a
                    className="secondary"
                    href={base + "/profile/documents/" + d.id + "/download"}
                  >
                    Download
                  </a>
                </article>
              ))}
            </div>
            <button
              className="primary"
              disabled={busy || !ready}
              onClick={() => setTab("classes")}
            >
              Continue to available classes <ArrowRight size={16} />
            </button>
          </section>
        )}
        {tab === "applications" && (
          <>
            <StudentSubmissions
              submissions={submissions}
              holds={applications}
              classes={classes}
              act={act}
              busy={busy}
              navigate={setTab}
              now={now}
            />
            <section className="panel">
              <h2>Seat reservations &amp; payments</h2>
              <p className="muted">
                Reservations last 35 minutes. Open Stripe Checkout promptly; the
                checkout payment window is 30 minutes.
              </p>
              {applications.length === 0 ? (
                <Empty>
                  No seat reservations yet. Reserve an available seat after your
                  application is approved.
                </Empty>
              ) : (
                <div className="record-list">
                  {applications.map((a) => {
                    const left = Math.max(
                        0,
                        Math.ceil(
                          (new Date(a.expiresAt).getTime() - now) / 1000,
                        ),
                      ),
                      status =
                        a.status === "HELD" && !left ? "EXPIRED" : a.status,
                      payment = payments.find((p) => p.holdId === a.holdId);
                    return (
                      <article className="application-record" key={a.holdId}>
                        <div>
                          <h3>{a.className}</h3>
                          <p className="reference">{a.holdId}</p>
                          <Status>{status}</Status>
                          {payment && (
                            <p>
                              Payment: {payment.status} ·{" "}
                              {money(payment.amount)}
                            </p>
                          )}
                        </div>
                        <div className="record-actions">
                          {status === "HELD" && (
                            <>
                              <strong className="countdown">
                                {Math.floor(left / 60)
                                  .toString()
                                  .padStart(2, "0")}
                                :{(left % 60).toString().padStart(2, "0")}
                              </strong>
                              <button
                                className="primary"
                                disabled={busy}
                                onClick={() =>
                                  void act(async () => {
                                    const result = await request<{
                                      url: string;
                                    }>(
                                      "/payments/" + a.holdId + "/checkout",
                                      "POST",
                                      {},
                                    );
                                    window.location.assign(result.url);
                                  })
                                }
                              >
                                <CreditCard size={16} />
                                Pay with Stripe
                              </button>
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Cancel this reservation and release the seat?",
                                    )
                                  )
                                    void act(async () => {
                                      await request(
                                        "/holds/" + a.holdId,
                                        "DELETE",
                                      );
                                    }, "Reservation cancelled.");
                                }}
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {status === "CONFIRMED" &&
                            ["receipt", "admission-card"].map((k) => (
                              <a
                                className="secondary"
                                key={k}
                                href={base + "/downloads/" + a.holdId + "/" + k}
                              >
                                <Download size={16} />
                                {k === "receipt" ? "Receipt" : "Admission card"}
                              </a>
                            ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
        {tab === "review" && <ReviewQueue act={act} busy={busy} />}
        {selectedClass && (
          <ApplicationDialog
            account={account}
            documents={documents}
            classRoom={selectedClass}
            fee={fees[selectedClass.id]}
            busy={busy}
            act={act}
            close={() => setSelectedClass(null)}
            navigate={setTab}
          />
        )}
        {tab === "search" && <SearchApplications classes={classes} />}
        {admin && ["payments", "notifications", "audit"].includes(tab) && (
          <AdminRecords key={tab} kind={tab} act={act} busy={busy} />
        )}
      </main>
    </div>
  );
}

function Pagination({
  page,
  total,
  change,
}: {
  page: number;
  total: number;
  change: (n: number) => void;
}) {
  return (
    <div className="pagination">
      <button disabled={page === 1} onClick={() => change(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} · {total} records
      </span>
      <button disabled={page * 25 >= total} onClick={() => change(page + 1)}>
        Next
      </button>
    </div>
  );
}
function SearchApplications({ classes }: { classes: ClassRoom[] }) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [classId, setClassId] = useState(""),
    [page, setPage] = useState(1),
    [items, setItems] = useState<RecordRow[]>([]),
    [total, setTotal] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      void request<{ items: RecordRow[]; total: number }>(
        "/admin/applications?" +
          new URLSearchParams({ search, status, classId, page: String(page) }),
      )
        .then((d) => {
          if (!cancelled) {
            setItems(d.items);
            setTotal(d.total);
            setError("");
          }
        })
        .catch((e) => {
          if (!cancelled) setError(err(e));
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, status, classId, page]);
  return (
    <section className="panel">
      <h2>Search admission records</h2>
      <div className="filters">
        <input
          aria-label="Search applications"
          placeholder="Name, email, birth registration or reference"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Application status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {["PendingReview", "Approved", "ChangesRequested", "Rejected"].map(
            (x) => (
              <option key={x}>{x}</option>
            ),
          )}
        </select>
        <select
          aria-label="Class"
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {items.length === 0 ? (
        <Empty>No applications match your search.</Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Class / shift</th>
                <th>Birth registration</th>
                <th>Status</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <td>
                    <strong>{x.fullName}</strong>
                    <small>{x.email}</small>
                  </td>
                  <td>{x.className}</td>
                  <td>{x.birthRegistration}</td>
                  <td>
                    <Status>{x.status}</Status>
                  </td>
                  <td className="reference">{x.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} change={setPage} />
    </section>
  );
}
function AdminRecords({
  kind,
  act,
  busy,
}: {
  kind: string;
  act: Act;
  busy: boolean;
}) {
  const [items, setItems] = useState<RecordRow[]>([]),
    [error, setError] = useState("");
  const load = useCallback(
    async () => setItems(await request<RecordRow[]>("/admin/" + kind)),
    [kind],
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      void load().catch((e) => setError(err(e)));
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <section className="panel">
      <h2>Recent {kind}</h2>
      <p className="muted">Latest 100 database records.</p>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {items.length === 0 ? (
        <Empty>No records yet.</Empty>
      ) : (
        <div className="record-list">
          {items.map((x) => (
            <article key={x.id}>
              <div>
                <strong>
                  {kind === "payments"
                    ? money(x.amount || 0)
                    : kind === "notifications"
                      ? x.subject
                      : x.action}
                </strong>
                <p className="reference">
                  {kind === "audit" ? x.resourceId : x.id}
                </p>
                {x.lastError && <p>{x.lastError}</p>}
                {kind === "payments" && (
                  <p className="reference">Application: {x.holdId}</p>
                )}
                {kind === "notifications" && (
                  <p>
                    {x.channel} · {x.attempts} attempts
                  </p>
                )}
              </div>
              {kind === "audit" ? (
                <time>{new Date(x.createdAt!).toLocaleString()}</time>
              ) : (
                <Status>
                  {kind === "payments"
                    ? x.status
                    : x.sentAt
                      ? "Sent"
                      : (x.attempts || 0) >= 8
                        ? "Failed"
                        : "Queued"}
                </Status>
              )}
              {((kind === "payments" && x.status === "RefundRequired") ||
                (kind === "notifications" && !x.sentAt)) && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await request(
                        "/admin/" +
                          kind +
                          "/" +
                          x.id +
                          (kind === "payments" ? "/retry-refund" : "/retry"),
                        "POST",
                        {},
                      );
                      await load();
                    }, "Action completed.")
                  }
                >
                  {kind === "payments" ? "Retry refund" : "Retry delivery"}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
