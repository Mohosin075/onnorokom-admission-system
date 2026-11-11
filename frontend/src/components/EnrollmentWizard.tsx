import { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { useLanguage } from "../context/language-store";
import { useStudent } from "../context/student-store";
import { api, getErrorMessage } from "../services/api";
import type { ClassItem, HoldItem } from "../types";
import { ActiveHoldCard } from "./ActiveHoldCard";
import { ClassList } from "./ClassList";

interface EnrollmentWizardProps {
  classId: string | null;
  initialHoldId: string | null;
  classes: ClassItem[];
  classesLoading: boolean;
  connected: boolean;
  onReserved: (hold: HoldItem) => void;
  onUpdated: (hold?: HoldItem) => void;
  onCancelled: () => void;
  onBrowse: () => void;
  onViewApplications: () => void;
  onViewAdmission: (hold: HoldItem) => void;
}

export function EnrollmentWizard({
  classId,
  initialHoldId,
  classes,
  classesLoading,
  connected,
  onReserved,
  onUpdated,
  onCancelled,
  onBrowse,
  onViewApplications,
  onViewAdmission,
}: EnrollmentWizardProps) {
  const { t, language } = useLanguage();
  const { studentId, isValidStudentId } = useStudent();
  const [step, setStep] = useState(initialHoldId ? 2 : 0);
  const [selectedClassId, setSelectedClassId] = useState(classId);
  const [hold, setHold] = useState<HoldItem | null>(null);
  const [holdId, setHoldId] = useState(initialHoldId);
  const [reserving, setReserving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [lookupRevision, setLookupRevision] = useState(0);
  const [lookup, setLookup] = useState<{
    studentId: string;
    revision: number;
    holds: HoldItem[];
    error: string | null;
  } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const submitting = useRef(false);
  const identity = useRef(studentId);
  useEffect(() => {
    identity.current = studentId;
  }, [studentId]);
  useEffect(() => {
    if (!isValidStudentId || holdId) return;
    let disposed = false;
    const timer = setTimeout(() => {
      api
        .getMyHolds(studentId)
        .then((holds) => {
          if (!disposed)
            setLookup({
              studentId,
              revision: lookupRevision,
              holds,
              error: null,
            });
        })
        .catch((failure) => {
          if (!disposed)
            setLookup({
              studentId,
              revision: lookupRevision,
              holds: [],
              error: getErrorMessage(failure),
            });
        });
    }, 0);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [studentId, isValidStudentId, holdId, lookupRevision]);
  useEffect(() => {
    mounted.current = true;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      clearInterval(clock);
    };
  }, []);
  const selectedClass = classes.find(
    (item) => item.id === (hold?.classId ?? selectedClassId),
  );
  const complete = hold?.status === "CONFIRMED";
  const effectiveStep = complete ? 3 : step;
  useEffect(() => {
    const target =
      effectiveStep === 0
        ? document.getElementById("header-student-id")
        : panel.current;
    target?.focus({ preventScroll: effectiveStep !== 0 });
  }, [effectiveStep, selectedClassId]);
  const reservationActive =
    hold?.status === "HELD" && new Date(hold.expiresAt).getTime() > now;
  const lookupCurrent =
    lookup?.studentId === studentId && lookup.revision === lookupRevision;
  const checking = isValidStudentId && !holdId && !lookupCurrent;
  const lookupError = lookupCurrent ? lookup.error : null;
  const existingApplications = lookupCurrent
    ? lookup.holds.filter(
        (item) =>
          item.status === "CONFIRMED" ||
          (item.status === "HELD" && new Date(item.expiresAt).getTime() > now),
      )
    : [];
  const selectedExisting = existingApplications.find(
    (item) => item.classId === selectedClassId,
  );
  const canContinue =
    isValidStudentId && lookupCurrent && !lookupError && !selectedExisting;
  const lookupFeedback = checking ? (
    <p role="status">{t("Checking existing applications…")}</p>
  ) : lookupError ? (
    <div role="alert" className="admission-history-error">
      <p>
        {t(
          "We could not check previous applications. Try again before continuing.",
        )}
      </p>
      <p>{t(lookupError)}</p>
      <button
        type="button"
        onClick={() => setLookupRevision((value) => value + 1)}
      >
        {t("Try again")}
      </button>
    </div>
  ) : null;
  const labels = [
    t("Student details"),
    t("Review and reserve"),
    t("Pay to confirm"),
    t("Confirmation"),
  ];

  const openExisting = (existing: HoldItem) => {
    if (existing.status === "CONFIRMED") {
      onViewAdmission(existing);
      return;
    }
    if (new Date(existing.expiresAt).getTime() <= now) return;
    setHold(existing);
    setHoldId(existing.holdId);
    setSelectedClassId(existing.classId);
    setError(null);
    setStep(2);
    onReserved(existing);
  };
  const chooseAnotherClass = () => {
    setSelectedClassId(null);
    setError(null);
    setStep(1);
  };
  const existingNotice = (existing: HoldItem, showClass = false) => (
    <div key={existing.holdId} className="admission-existing-application">
      <div>
        <strong>
          {t(
            existing.status === "CONFIRMED"
              ? "You are already admitted to this class."
              : "A seat is already reserved for you.",
          )}
        </strong>
        {showClass && (
          <p>
            {existing.className ??
              classes.find((item) => item.id === existing.classId)?.name ??
              existing.classId}
          </p>
        )}
        <p>
          {t(
            existing.status === "CONFIRMED"
              ? "View your admission details or choose a different class. You do not need to apply again."
              : "Continue your existing payment before the deadline. You do not need to reserve another seat.",
          )}
        </p>
        {existing.status === "HELD" && (
          <p>
            {t("Payment deadline")}:{" "}
            <time dateTime={existing.expiresAt}>
              {new Date(existing.expiresAt).toLocaleString(
                language === "bn" ? "bn-BD" : "en-US",
                {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                },
              )}
            </time>
          </p>
        )}
      </div>
      <button
        type="button"
        className="admission-primary"
        onClick={() => openExisting(existing)}
      >
        {t(
          existing.status === "CONFIRMED"
            ? "View admission"
            : "Continue payment",
        )}
      </button>
      {selectedClassId && (
        <button
          type="button"
          className="admission-secondary"
          onClick={chooseAnotherClass}
        >
          {t("Choose another class")}
        </button>
      )}
    </div>
  );

  const reserve = async () => {
    if (submitting.current || !selectedClass || !canContinue) return;
    const submittedIdentity = studentId;
    submitting.current = true;
    setReserving(true);
    setError(null);
    try {
      const reservation = await api.createHold(
        selectedClass.id,
        submittedIdentity,
      );
      if (!mounted.current || identity.current !== submittedIdentity) return;
      setHold(reservation);
      setHoldId(reservation.holdId);
      setStep(2);
      onReserved(reservation);
    } catch (failure) {
      if (mounted.current && identity.current === submittedIdentity) {
        // Another browser may have reserved after the identity check.
        if (isAxiosError(failure) && failure.response?.status === 409) {
          try {
            const latest = await api.getMyHolds(submittedIdentity);
            if (!mounted.current || identity.current !== submittedIdentity)
              return;
            setLookup({
              studentId: submittedIdentity,
              revision: lookupRevision,
              holds: latest,
              error: null,
            });
            if (
              latest.some(
                (item) =>
                  item.classId === selectedClass.id &&
                  (item.status === "CONFIRMED" ||
                    (item.status === "HELD" &&
                      new Date(item.expiresAt).getTime() > Date.now())),
              )
            ) {
              setError(null);
              return;
            }
          } catch {
            /* Retain the original reservation error when reconciliation is unavailable. */
          }
        }
        if (mounted.current && identity.current === submittedIdentity)
          setError(getErrorMessage(failure));
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setReserving(false);
    }
  };

  return (
    <section className="admission-enrollment" aria-label={t("Enrollment form")}>
      <div className="admission-enrollment-heading">
        <button
          className="admission-back"
          onClick={onBrowse}
          disabled={reserving}
        >
          <ArrowLeft size={17} />
          {t("Back to classes")}
        </button>
        <span>
          {t("Step {current} of {total}", {
            current: effectiveStep + 1,
            total: labels.length,
          })}
        </span>
      </div>
      <h2>
        {selectedClass?.name ??
          t(
            initialHoldId
              ? "Your selected application"
              : "New student admission",
          )}
      </h2>
      <p>
        {t(
          "Complete one step at a time. Review your details before reserving a seat.",
        )}
      </p>
      <ol
        className="admission-enrollment-steps"
        aria-label={t("Enrollment steps")}
      >
        {labels.map((label, index) => (
          <li
            key={index}
            className={
              index < effectiveStep || complete
                ? "is-complete"
                : index === effectiveStep
                  ? "is-current"
                  : ""
            }
            aria-current={
              !complete && index === effectiveStep ? "step" : undefined
            }
          >
            <span aria-hidden="true">
              {index < effectiveStep || complete ? (
                <Check size={16} />
              ) : (
                index + 1
              )}
            </span>
            {label}
            {(index < effectiveStep || complete) && (
              <span className="admission-sr-only">{t("Completed")}</span>
            )}
          </li>
        ))}
      </ol>
      <div
        ref={panel}
        role="group"
        tabIndex={-1}
        className="admission-enrollment-panel"
        aria-label={labels[effectiveStep]}
      >
        {step === 0 && !holdId && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (canContinue) {
                setError(null);
                setStep(1);
              }
            }}
          >
            <h3>{t("Who is applying?")}</h3>
            <p>
              {t(
                "Enter the student's 17-digit birth registration number at the top of the page. Use the same number to find this application later.",
              )}
            </p>
            <p className="admission-wizard-identity">
              {t("Birth registration number:")} <strong>{studentId}</strong>
            </p>
            {lookupFeedback}
            {selectedExisting && existingNotice(selectedExisting)}
            {!selectedClassId && existingApplications.length > 0 && (
              <div className="admission-existing-list" aria-live="polite">
                <p>
                  {t(
                    "We found applications for this number. Continue one below, or choose a class for a new application.",
                  )}
                </p>
                {existingApplications.map((item) => existingNotice(item, true))}
              </div>
            )}
            {!selectedExisting && (
              <>
                <p className="admission-wizard-next">
                  {t(
                    selectedClassId
                      ? "Next: review the class and student number. No seat is reserved yet."
                      : "Next: choose a class, then review the student's details before reserving.",
                  )}
                </p>
                <div className="admission-wizard-actions">
                  <button
                    type="submit"
                    className="admission-primary"
                    disabled={!canContinue}
                  >
                    {t(
                      selectedClassId ? "Continue to review" : "Choose a class",
                    )}
                    <ArrowRight size={17} />
                  </button>
                </div>
              </>
            )}
          </form>
        )}
        {step === 1 && !holdId && lookupFeedback}
        {step === 1 && !holdId && !selectedClassId && (
          <div>
            <p className="admission-wizard-identity">
              {t("Birth registration number:")} <strong>{studentId}</strong>
            </p>
            <ClassList
              classes={classes}
              loading={classesLoading}
              connected={connected}
              applications={existingApplications}
              onSelectHold={(id) => {
                const existing = existingApplications.find(
                  (item) => item.holdId === id,
                );
                if (existing) openExisting(existing);
              }}
              onStartEnrollment={(item) => {
                setSelectedClassId(item.id);
                setError(null);
              }}
            />
            <div className="admission-wizard-actions">
              <button
                className="admission-secondary"
                onClick={() => setStep(0)}
              >
                {t("Back to student details")}
              </button>
            </div>
          </div>
        )}
        {step === 1 && !holdId && selectedClassId && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void reserve();
            }}
          >
            <h3>{t("Check your details")}</h3>
            <p>
              {t(
                "Make sure the student number and class are correct. The seat timer starts when you reserve.",
              )}
            </p>
            <dl className="admission-review-details">
              <div>
                <dt>{t("Birth registration number")}</dt>
                <dd>{studentId}</dd>
              </div>
              <div>
                <dt>{t("Class / Shift")}</dt>
                <dd>
                  {selectedClass?.name ?? t("Classes could not be loaded")}
                </dd>
              </div>
              <div>
                <dt>{t("Available seats")}</dt>
                <dd>{selectedClass?.availableSeats ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("Payment")}</dt>
                <dd className="admission-payment-method">
                  <span className="admission-payment-badge">
                    {t("Online Payment")}
                  </span>
                  <span className="admission-payment-channels">
                    {t("bKash, Nagad, Cards")}
                  </span>
                </dd>
              </div>
            </dl>
            {selectedExisting && existingNotice(selectedExisting)}
            {error && !selectedExisting && (
              <div role="alert" className="admission-history-error">
                <p>{t(error)}</p>
                <p>
                  {t(
                    "Your details are saved here. Try again, or go back to choose another class.",
                  )}
                </p>
              </div>
            )}
            {selectedClass?.availableSeats === 0 && !selectedExisting && (
              <p role="status">
                {t(
                  "This class is currently full. Go back to choose another class, or wait for a seat to become available.",
                )}
              </p>
            )}
            {!selectedExisting && (
              <p className="admission-wizard-next">
                {t(
                  "Next: your seat is held and you can pay the admission fee.",
                )}
              </p>
            )}
            <div className="admission-wizard-actions">
              <button
                type="button"
                className="admission-secondary"
                disabled={reserving}
                onClick={() => {
                  setError(null);
                  setStep(0);
                }}
              >
                {t("Back to student details")}
              </button>
              {!selectedExisting && (
                <button
                  type="submit"
                  className="admission-primary"
                  disabled={
                    reserving ||
                    !canContinue ||
                    !selectedClass ||
                    selectedClass.availableSeats <= 0
                  }
                >
                  {reserving
                    ? t("Reserving your seat…")
                    : t("Reserve seat and continue")}
                  <ArrowRight size={17} />
                </button>
              )}
            </div>
          </form>
        )}
        {holdId && (
          <>
            <h3>
              {complete
                ? t("Admission complete")
                : t("Confirm your reserved seat")}
            </h3>
            <p className="admission-wizard-identity">
              {t("Birth registration number:")} <strong>{studentId}</strong>
            </p>
            {complete && (
              <p className="admission-wizard-success" role="status">
                <ShieldCheck size={20} />
                {t(
                  "All steps are complete. Your admission is saved in My applications.",
                )}
              </p>
            )}
            <ActiveHoldCard
              key={`${studentId}:${holdId}`}
              holdId={holdId}
              classes={classes}
              onStatusChange={setHold}
              onHoldUpdated={(updated) => {
                if (updated) setHold(updated);
                onUpdated(updated);
              }}
              onHoldDismissed={onCancelled}
              onBrowseClasses={onBrowse}
              onViewApplications={onViewApplications}
              onError={setError}
            />
            {error && (
              <p role="alert" className="admission-wizard-error">
                {t(error)}
              </p>
            )}
            {reservationActive && (
              <p className="admission-wizard-next">
                {t(
                  "Going back to classes keeps your reservation until its deadline. You can resume it from My applications.",
                )}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
