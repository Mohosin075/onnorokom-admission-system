import { useLanguage } from "../context/language-store";
import {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  Plus,
  UserPlus,
  CircleHelp,
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
            <GraduationCap size={25} />
          </span>
          <span>
            {t("School admissions")}
            <small>{t("Admission portal")}</small>
          </span>
        </a>
        <p className="admission-nav-label">{t("MENU")}</p>
        <nav aria-label={t("Workspace")} className="admission-workspaces">
          <button
            aria-label={t("Student admissions")}
            aria-pressed={workspace === "student"}
            onClick={() => onWorkspaceChange("student")}
          >
            <BookOpen size={19} />
            <span>
              {t("Student admissions")}
              <small>{t("Apply or check your application")}</small>
            </span>
          </button>
          <button
            aria-label={t("Admin workspace")}
            aria-pressed={workspace === "admin"}
            onClick={() => onWorkspaceChange("admin")}
          >
            <LayoutDashboard size={19} />
            <span>
              {t("Admin workspace")}
              <small>{t("Add classes and check seats")}</small>
            </span>
          </button>
        </nav>
        <div className="admission-sidebar-note">
          <div className="admission-sidebar-help-heading">
            <CircleHelp size={18} />
            <strong>{t("Returning student?")}</strong>
          </div>
          <p>
            {t(
              "Use your birth registration number to find your applications or continue payment.",
            )}
          </p>
          <button
            className="admission-sidebar-help-link"
            onClick={onFindApplications}
          >
            {t("Find my applications")}
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="admission-sidebar-footer">
          <div className="admission-sidebar-status">
            <span className="admission-live-dot" />
            {t("Live seat availability")}
          </div>
          <small>{t("No account required")}</small>
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
