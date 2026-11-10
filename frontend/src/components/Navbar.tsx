import { useLanguage } from "../context/language-store";
import {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  Plus,
  UserPlus,
  Search,
  ArrowRight,
} from "lucide-react";
interface NavbarProps {
  onNewStudent: () => void;
  onFindApplications: () => void;
  onOpenCreateClass: () => void;
  workspace: "student" | "admin";
  onWorkspaceChange: (value: "student" | "admin") => void;
}
export function Navbar({
  onNewStudent,
  onFindApplications,
  onOpenCreateClass,
  workspace,
  onWorkspaceChange,
}: NavbarProps) {
  const { t, language, setLanguage } = useLanguage();

  return (
    <>
      <aside className="admission-sidebar">
        <a
          className="admission-brand"
          href="#main-content"
          aria-label={t("School admissions home")}
        >
          <span className="admission-brand-icon">
            <GraduationCap size={23} />
          </span>
          <span className="admission-brand-text">
            <strong>{t("School admissions")}</strong>
            <small>{t("Official Admission Portal")}</small>
          </span>
        </a>

        <div className="admission-sidebar-divider" />

        <p className="admission-nav-label">{t("MENU")}</p>
        <nav aria-label={t("Workspace")} className="admission-workspaces">
          <button
            aria-label={t("Student admissions")}
            aria-pressed={workspace === "student"}
            onClick={() => onWorkspaceChange("student")}
            className={workspace === "student" ? "is-active" : ""}
          >
            <BookOpen size={18} />
            <span>
              {t("Student admissions")}
              <small>{t("Apply or check your application")}</small>
            </span>
          </button>
          <button
            aria-label={t("Admin workspace")}
            aria-pressed={workspace === "admin"}
            onClick={() => onWorkspaceChange("admin")}
            className={workspace === "admin" ? "is-active" : ""}
          >
            <LayoutDashboard size={18} />
            <span>
              {t("Admin workspace")}
              <small>{t("Add classes and check seats")}</small>
            </span>
          </button>
        </nav>

        <div className="admission-sidebar-note">
          <div className="admission-sidebar-help-heading">
            <span className="admission-sidebar-help-icon">
              <Search size={15} />
            </span>
            <strong>{t("Returning student?")}</strong>
          </div>
          <p>
            {t(
              "Use your birth registration number to find your applications or continue payment.",
            )}
          </p>
          <button
            type="button"
            className="admission-sidebar-help-link"
            onClick={onFindApplications}
          >
            <span>{t("Find my applications")}</span>
            <ArrowRight size={14} />
          </button>
        </div>

        <div className="admission-sidebar-footer">
          <div className="admission-sidebar-status">
            <span className="admission-live-dot" />
            <span>{t("Live seat availability")}</span>
          </div>
          <small className="admission-sidebar-session">
            {t("Academic Session 2026–2027")}
          </small>
        </div>
      </aside>
      <header className="admission-topbar">
        <div>
          <span className="admission-eyebrow">
            {t("ADMISSIONS /")}{" "}
            {workspace === "student" ? t("STUDENT") : t("ADMIN")}
          </span>
          <p>
            {workspace === "student"
              ? t("Choose a class or check an existing application.")
              : t("Add classes and see how many seats are left.")}
          </p>
        </div>
        <div className="admission-topbar-actions">
          {workspace === "student" && (
            <button className="admission-primary" onClick={onNewStudent}>
              <UserPlus size={18} />
              {t("New student admission")}
            </button>
          )}
          {workspace === "admin" && (
            <button className="admission-primary" onClick={onOpenCreateClass}>
              <Plus size={17} />
              {t("Add a class")}
            </button>
          )}
          <label className="admission-language">
            <select
              aria-label="Language / ভাষা"
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value === "bn" ? "bn" : "en")
              }
            >
              <option value="en" lang="en">
                English
              </option>
              <option value="bn" lang="bn">
                বাংলা
              </option>
            </select>
          </label>
        </div>
      </header>
    </>
  );
}
