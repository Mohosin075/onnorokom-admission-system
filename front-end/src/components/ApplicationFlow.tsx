import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Download, X } from "lucide-react";
import {
  base,
  request,
  type Account,
  type AdmissionSubmission,
  type Application,
  type ClassRoom,
  type Document,
  type ReviewDetail,
} from "../services/portal";
import "./application-flow.css";

const label = (status: string) =>
  ({
    PendingReview: "Under review",
    ChangesRequested: "Corrections needed",
    Approved: "Approved to reserve",
    Rejected: "Rejected",
  })[status] || status;
const documentName = (kind: string) => kind.replace(/([A-Z])/g, " $1").trim();
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Please retry.";
type Act = (task: () => Promise<void>, notice?: string) => Promise<void>;

export function ApplicationDialog({
  account,
  documents,
  classRoom,
  fee,
  busy,
  act,
  close,
  navigate,
}: {
  account: Account;
  documents: Document[];
  classRoom: ClassRoom;
  fee?: number;
  busy: boolean;
  act: Act;
  close: () => void;
  navigate: (tab: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const profileReady = !!(
    account.birthRegistration &&
    account.fullName &&
    account.dateOfBirth &&
    account.guardianName &&
    account.phone &&
    account.address
  );
  const missing = ["BirthCertificate", "Photograph"].filter(
    (kind) => !documents.some((d) => d.kind === kind),
  );
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      className="application-dialog"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
      aria-labelledby="submit-application-title"
    >
      <div className="section-title">
        <div>
          <span className="eyebrow">SUBMIT FOR ADMISSIONS REVIEW</span>
          <h2 id="submit-application-title">Apply to {classRoom.name}</h2>
        </div>
        <button
          className="quiet"
          disabled={busy}
          aria-label="Close application"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      <p className="muted">
        Your application and uploaded documents will be reviewed together. No
        payment or seat reservation starts at this step.
      </p>
      <dl className="application-facts">
        <dt>Applicant</dt>
        <dd>{account.fullName || "Profile incomplete"}</dd>
        <dt>Birth registration</dt>
        <dd>{account.birthRegistration || "Not provided"}</dd>
        <dt>Class / shift</dt>
        <dd>{classRoom.name}</dd>
        <dt>Admission fee after approval</dt>
        <dd>{fee?.toFixed(2)} BDT</dd>
      </dl>
      {!profileReady && (
        <div className="alert error">
          Complete your applicant and guardian profile first.{" "}
          <button
            className="text-link"
            onClick={() => {
              close();
              navigate("profile");
            }}
          >
            Complete profile
          </button>
        </div>
      )}
      <div className="submission-documents">
        {["BirthCertificate", "Photograph", "AcademicRecord"].map((kind) => {
          const doc = documents.find((d) => d.kind === kind);
          return (
            <div key={kind}>
              <strong>
                {documentName(kind)}
                {kind === "AcademicRecord" ? " (optional)" : ""}
              </strong>
              <span>{doc ? doc.originalName : "Not uploaded"}</span>
              {doc && <Check size={16} />}
            </div>
          );
        })}
      </div>
      {missing.length > 0 && (
        <div className="alert error">
          Upload {missing.map(documentName).join(" and ")} before submitting.
          Approval is not required yet.{" "}
          <button
            className="text-link"
            onClick={() => {
              close();
              navigate("profile");
            }}
          >
            Upload documents
          </button>
        </div>
      )}
      <p className="hint">
        Approval allows you to reserve a seat if one is available. It does not
        guarantee a seat. The payment timer begins only when you choose Reserve
        &amp; pay.
      </p>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      <button
        className="primary wide"
        disabled={busy || !profileReady || missing.length > 0}
        onClick={() => {
          setError("");
          void act(async () => {
            try {
              await request("/applications", "POST", { classId: classRoom.id });
              close();
              navigate("applications");
            } catch (e) {
              setError(errorMessage(e));
              throw e;
            }
          }, "Application submitted. Admissions will review your details and documents. No seat has been reserved yet.");
        }}
      >
        Submit application
        <ArrowRight size={16} />
      </button>
    </dialog>
  );
}

export function StudentSubmissions({
  submissions,
  holds,
  classes,
  act,
  busy,
  navigate,
  now,
}: {
  submissions: AdmissionSubmission[];
  holds: Application[];
  classes: ClassRoom[];
  act: Act;
  busy: boolean;
  navigate: (tab: string) => void;
  now: number;
}) {
  return (
    <section className="panel">
      <h2>Submitted applications</h2>
      <p className="muted">
        Apply first, then let admissions review your documents. Reserve and pay
        only after approval.
      </p>
      {submissions.length === 0 ? (
        <div className="empty">
          <p>No application submitted yet. Choose a class to get started.</p>
          <button className="secondary" onClick={() => navigate("classes")}>
            Browse classes
          </button>
        </div>
      ) : (
        <div className="record-list">
          {submissions.map((application) => {
            const room = classes.find((c) => c.id === application.classId);
            const active = holds.some(
              (h) =>
                h.classId === application.classId &&
                (h.status === "CONFIRMED" ||
                  (h.status === "HELD" &&
                    new Date(h.expiresAt).getTime() > now)),
            );
            return (
              <article className="application-record" key={application.id}>
                <div>
                  <h3>{application.className}</h3>
                  <p className="reference">Application: {application.id}</p>
                  <span
                    className={
                      "status status-" + application.status.toLowerCase()
                    }
                  >
                    {label(application.status)}
                  </span>
                  <p>
                    Submitted{" "}
                    {new Date(application.submittedAt).toLocaleString()}
                  </p>
                  {application.reviewNote && (
                    <div className="review-feedback">
                      <strong>
                        {application.status === "PendingReview"
                          ? "Previous review feedback"
                          : "Admissions feedback"}
                      </strong>
                      <p>{application.reviewNote}</p>
                    </div>
                  )}
                  {application.status === "PendingReview" && (
                    <p className="hint">
                      Waiting for review. No seat held and no payment timer
                      running.
                    </p>
                  )}
                  {application.status === "Approved" && (
                    <p className="hint">
                      {active
                        ? "Your reservation / payment details are below."
                        : "You may now reserve an available seat. Approval does not guarantee capacity."}
                    </p>
                  )}
                </div>
                <div className="record-actions">
                  {application.status === "Approved" && !active && (
                    <button
                      className="primary"
                      disabled={busy || !room || room.availableSeats < 1}
                      onClick={() =>
                        void act(async () => {
                          await request(
                            "/classes/" + application.classId + "/holds",
                            "POST",
                            {},
                          );
                        }, "Seat reserved. Your payment countdown has now started.")
                      }
                    >
                      {room && room.availableSeats < 1
                        ? "No seats currently available"
                        : "Reserve & pay"}
                      <ArrowRight size={16} />
                    </button>
                  )}
                  {application.status === "ChangesRequested" && (
                    <>
                      <button
                        className="secondary"
                        onClick={() => navigate("profile")}
                      >
                        Edit profile &amp; documents
                      </button>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await request("/applications", "POST", {
                              classId: application.classId,
                            });
                          }, "Corrections submitted for another review.")
                        }
                      >
                        Resubmit application
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function ReviewQueue({ act, busy }: { act: Act; busy: boolean }) {
  const [status, setStatus] = useState("PendingReview");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<
    (AdmissionSubmission & { fullName: string; email: string })[]
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let disposed = false;
    let running = false;
    async function refresh() {
      if (running || disposed) return;
      running = true;
      await request<{ items: typeof items; total: number }>(
        `/admin/applications?status=${status}&page=${page}`,
      )
        .then((data) => {
          if (!disposed) {
            setItems(data.items);
            setTotal(data.total);
          }
        })
        .catch((e) => {
          if (!disposed) setError(errorMessage(e));
        })
        .finally(() => {
          running = false;
        });
    }
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 10000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [status, page, revision]);
  useEffect(() => {
    let disposed = false;
    if (selectedId)
      void request<ReviewDetail>("/admin/applications/" + selectedId)
        .then((data) => {
          if (!disposed) setDetail(data);
        })
        .catch((e) => {
          if (!disposed) setError(errorMessage(e));
        });
    return () => {
      disposed = true;
    };
  }, [selectedId, revision]);
  const decide = useCallback(
    (decision: string) => {
      if (!detail) return;
      void act(
        async () => {
          await request("/admin/applications/" + detail.id + "/review", "PUT", {
            status: decision,
            version: detail.version,
            note,
            reviewedDocumentIds: checked,
          });
          setSelectedId(null);
          setDetail(null);
          setRevision((n) => n + 1);
        },
        decision === "Approved"
          ? "Application approved. The applicant can now reserve and pay."
          : decision === "ChangesRequested"
            ? "Correction request sent to the applicant."
            : "Application rejected with feedback.",
      );
    },
    [act, checked, detail, note],
  );
  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <h2>Application review queue</h2>
          <p className="muted">
            Review the applicant, selected class and exact submitted documents
            together.
          </p>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setChecked([]);
            setNote("");
            setError("");
            setDetail(null);
            setRevision((n) => n + 1);
          }}
        >
          {selectedId ? "Refresh application" : "Refresh queue"}
        </button>
        <select
          aria-label="Review status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
            setSelectedId(null);
            setDetail(null);
          }}
        >
          {["PendingReview", "ChangesRequested", "Approved", "Rejected"].map(
            (value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ),
          )}
        </select>
      </div>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {selectedId ? (
        detail ? (
          <div className="application-detail">
            <button
              className="text-link"
              disabled={busy}
              onClick={() => {
                setSelectedId(null);
                setDetail(null);
              }}
            >
              Back to review queue
            </button>
            <div className="review-heading">
              <div>
                <h2>{detail.applicant.fullName}</h2>
                <p>{detail.className}</p>
                <p className="reference">
                  {detail.id} · Submission version {detail.version}
                </p>
              </div>
              <span className={"status status-" + detail.status.toLowerCase()}>
                {label(detail.status)}
              </span>
            </div>
            <dl className="application-facts">
              <dt>Birth registration</dt>
              <dd>{detail.applicant.birthRegistration}</dd>
              <dt>Date of birth</dt>
              <dd>{detail.applicant.dateOfBirth}</dd>
              <dt>Guardian</dt>
              <dd>{detail.applicant.guardianName}</dd>
              <dt>Email / mobile</dt>
              <dd>
                {detail.applicant.email} / {detail.applicant.phone}
              </dd>
              <dt>Address</dt>
              <dd>{detail.applicant.address}</dd>
              <dt>Submitted</dt>
              <dd>{new Date(detail.submittedAt).toLocaleString()}</dd>
            </dl>
            {detail.status === "PendingReview" && detail.reviewNote && (
              <div className="review-feedback">
                <strong>Previous correction request</strong>
                <p>{detail.reviewNote}</p>
                <p className="hint">
                  Compare the resubmitted profile and files against this
                  feedback before deciding.
                </p>
              </div>
            )}
            <h3>Submitted documents</h3>
            <p className="muted">
              Check the applicant name, date of birth and birth registration
              against the certificate. Check that the photograph is readable and
              identifies the applicant. Use Request corrections for missing or
              inconsistent information.
            </p>
            <div className="review-documents">
              {detail.documents.map((doc) => (
                <article key={doc.id}>
                  <h3>{documentName(doc.kind)}</h3>
                  <a
                    href={base + "/profile/documents/" + doc.id + "/preview"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      src={base + "/profile/documents/" + doc.id + "/preview"}
                      alt={
                        documentName(doc.kind) +
                        " submitted by " +
                        detail.applicant.fullName
                      }
                    />
                  </a>
                  <p>{doc.originalName}</p>
                  <a
                    className="secondary"
                    href={base + "/profile/documents/" + doc.id + "/download"}
                  >
                    <Download size={14} />
                    Download original
                  </a>
                  {detail.status === "PendingReview" &&
                    doc.kind !== "AcademicRecord" && (
                      <label className="review-check">
                        <input
                          type="checkbox"
                          checked={checked.includes(doc.id)}
                          onChange={(e) =>
                            setChecked((current) =>
                              e.target.checked
                                ? [...current, doc.id]
                                : current.filter((id) => id !== doc.id),
                            )
                          }
                        />
                        I inspected this document against the applicant details.
                      </label>
                    )}
                </article>
              ))}
            </div>
            {detail.status === "PendingReview" ? (
              <>
                <label className="field">
                  <span>
                    Feedback to applicant (required for corrections or
                    rejection)
                  </span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={1000}
                  />
                </label>
                <div className="record-actions">
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !["BirthCertificate", "Photograph"].every((kind) =>
                        detail.documents.some(
                          (doc) =>
                            doc.kind === kind && checked.includes(doc.id),
                        ),
                      )
                    }
                    onClick={() => decide("Approved")}
                  >
                    Approve application
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || !note.trim()}
                    onClick={() => decide("ChangesRequested")}
                  >
                    Request corrections
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || !note.trim()}
                    onClick={() => decide("Rejected")}
                  >
                    Reject application
                  </button>
                </div>
                <p className="hint">
                  Approval enables reservation. It does not allocate a seat or
                  start the payment timer.
                </p>
              </>
            ) : (
              <div className="review-feedback">
                <strong>Decision recorded</strong>
                <p>{detail.reviewNote || "No additional note."}</p>
                <p>
                  {detail.reviewedBy} ·{" "}
                  {detail.reviewedAt &&
                    new Date(detail.reviewedAt).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p role="status">Loading application…</p>
        )
      ) : (
        <>
          {items.length === 0 ? (
            <div className="empty">
              <p>
                No submitted applications in this queue. Unsubmitted uploads do
                not appear here.
              </p>
            </div>
          ) : (
            <div className="record-list">
              {items.map((application) => (
                <article key={application.id}>
                  <div>
                    <h3>{application.fullName}</h3>
                    <p>
                      {application.className} · {application.email}
                    </p>
                    <p className="reference">{application.id}</p>
                    <p className="hint">
                      Submitted{" "}
                      {new Date(application.submittedAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => {
                      setError("");
                      setDetail(null);
                      setChecked([]);
                      setNote("");
                      setSelectedId(application.id);
                    }}
                  >
                    Review application
                    <ArrowRight size={16} />
                  </button>
                </article>
              ))}
            </div>
          )}
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>
              Page {page} · {total} applications
            </span>
            <button
              disabled={page * 25 >= total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
