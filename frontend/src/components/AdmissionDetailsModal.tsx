import { useEffect, useRef } from "react";
import { CheckCircle2, GraduationCap, ShieldCheck, X } from "lucide-react";
import { useLanguage } from "../context/language-store";
import type { HoldItem } from "../types";

interface AdmissionDetailsModalProps {
  admission: HoldItem;
  studentId: string;
  className: string;
  onClose: () => void;
}

export function AdmissionDetailsModal({
  admission,
  studentId,
  className,
  onClose,
}: AdmissionDetailsModalProps) {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    dialog.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="admission-details-dialog"
      aria-labelledby="admission-details-title"
      aria-describedby="admission-details-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="admission-details-surface">
        <header className="admission-details-heading">
          <span className="admission-details-icon">
            <GraduationCap size={25} aria-hidden="true" />
          </span>
          <div>
            <p>{t("Your admission")}</p>
            <h2 id="admission-details-title">{t("Admission details")}</h2>
          </div>
          <button
            className="admission-details-close"
            onClick={onClose}
            aria-label={t("Close admission details")}
          >
            <X size={20} />
          </button>
        </header>
        <div className="admission-details-content">
          <div className="admission-details-confirmed">
            <CheckCircle2 size={23} aria-hidden="true" />
            <div>
              <strong>{t("Admission Confirmed")}</strong>
              <p id="admission-details-description">
                {t(
                  "Your seat is confirmed. Keep this application reference for your records.",
                )}
              </p>
            </div>
          </div>
          <dl className="admission-details-list">
            <div>
              <dt>{t("Class / Shift")}</dt>
              <dd>{className}</dd>
            </div>
            <div>
              <dt>{t("Birth registration number")}</dt>
              <dd className="admission-details-number">{studentId}</dd>
            </div>
            <div>
              <dt>{t("Application reference")}</dt>
              <dd className="admission-details-number">{admission.holdId}</dd>
            </div>
            <div>
              <dt>{t("Payment")}</dt>
              <dd>{t("Payment completed")}</dd>
            </div>
          </dl>
          <p className="admission-details-note">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>
              {t(
                "Payment completed securely. Your admission has been confirmed.",
              )}
            </span>
          </p>
        </div>
        <footer className="admission-details-footer">
          <button className="admission-primary" onClick={onClose}>
            {t("Done")}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
