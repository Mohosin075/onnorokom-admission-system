import { Check } from "lucide-react";
import { useStudent } from "../context/student-store";
import { useLanguage } from "../context/language-store";

export function StudentIdentityInput({
  id = "student-id",
  enrollment = false,
}: {
  id?: string;
  enrollment?: boolean;
}) {
  const { studentId, setStudentId, isValidStudentId } = useStudent();
  const { t } = useLanguage();
  return (
    <div className="admission-identity">
      <label htmlFor={id}>{t("Birth registration number")}</label>
      <div
        className={
          isValidStudentId
            ? "admission-identity-input is-ready"
            : "admission-identity-input"
        }
      >
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          maxLength={17}
          value={studentId}
          onChange={(event) =>
            setStudentId(
              event.target.value
                .replace(/[\u09e6-\u09ef]/g, (digit) =>
                  String(digit.charCodeAt(0) - 0x09e6),
                )
                .replace(/\D/g, ""),
            )
          }
          placeholder={t("17-digit birth registration")}
          aria-describedby={`${id}-help`}
        />
        {isValidStudentId && (
          <Check size={17} aria-label={t("ID format ready")} />
        )}
      </div>
      <small id={`${id}-help`}>
        {isValidStudentId
          ? t(
              enrollment
                ? "17 digits entered."
                : "Use this number to find or start your applications.",
            )
          : t("{count} of 17 digits entered", { count: studentId.length })}
      </small>
    </div>
  );
}
