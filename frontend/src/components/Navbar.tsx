import {
  ArrowUpRight,
  BookOpen,
  Check,
  GraduationCap,
  LayoutDashboard,
  Plus,
} from "lucide-react";
import { useStudent } from "../context/student-store";
interface NavbarProps {
  onOpenCreateClass: () => void;
  workspace: "student" | "admin";
  onWorkspaceChange: (value: "student" | "admin") => void;
}
export function Navbar({
  onOpenCreateClass,
  workspace,
  onWorkspaceChange,
}: NavbarProps) {
  const { studentId, setStudentId, isValidStudentId } = useStudent();
  return (
    <>
      <aside className="admission-sidebar">
        <a
          className="admission-brand"
          href="#main-content"
          aria-label="School admissions home"
        >
          <span className="admission-brand-icon">
            <GraduationCap size={25} />
          </span>
          <span>
            School admissions<small>A place to begin.</small>
          </span>
        </a>
        <p className="admission-nav-label">YOUR WORKSPACE</p>
        <nav aria-label="Workspace" className="admission-workspaces">
          <button
            aria-label="Student admissions"
            aria-pressed={workspace === "student"}
            onClick={() => onWorkspaceChange("student")}
          >
            <BookOpen size={19} />
            <span>
              Student admissions<small>Find your class & apply</small>
            </span>
            {workspace === "student" && <span className="admission-nav-dot" />}
          </button>
          <button
            aria-label="Admin workspace"
            aria-pressed={workspace === "admin"}
            onClick={() => onWorkspaceChange("admin")}
          >
            <LayoutDashboard size={19} />
            <span>
              Admin workspace<small>Classes & seat capacity</small>
            </span>
            {workspace === "admin" && <span className="admission-nav-dot" />}
          </button>
        </nav>
        <div className="admission-sidebar-note">
          <span className="admission-eyebrow">HOW SEATS WORK</span>
          <p>
            First come.
            <br />
            First reserved.
          </p>
          <small>
            A reservation holds your seat temporarily. Confirm it before the
            countdown ends.
          </small>
          <ArrowUpRight size={22} />
        </div>
        <div className="admission-sidebar-footer">
          <span className="admission-live-dot" /> Live seat availability
          <small>No account required</small>
        </div>
      </aside>
      <header className="admission-topbar">
        <div>
          <span className="admission-eyebrow">
            ADMISSIONS / {workspace === "student" ? "STUDENT" : "ADMIN"}
          </span>
          <p>
            {workspace === "student"
              ? "Make room for your next chapter."
              : "Your admissions, in one place."}
          </p>
        </div>
        {workspace === "student" ? (
          <div className="admission-identity">
            <label htmlFor="student-id">Student ID:</label>
            <div
              className={
                isValidStudentId
                  ? "admission-identity-input is-ready"
                  : "admission-identity-input"
              }
            >
              <input
                id="student-id"
                inputMode="numeric"
                autoComplete="off"
                maxLength={17}
                value={studentId}
                onChange={(e) =>
                  setStudentId(e.target.value.replace(/\D/g, ""))
                }
                placeholder="17-digit birth registration"
                aria-describedby="student-id-help"
              />
              {isValidStudentId && (
                <Check size={17} aria-label="ID format ready" />
              )}
            </div>
            <small id="student-id-help">
              {isValidStudentId
                ? "ID ready · your applications are linked below"
                : studentId.length + "/17 digits · enter your ID to apply"}
            </small>
          </div>
        ) : (
          <button className="admission-primary" onClick={onOpenCreateClass}>
            <Plus size={17} /> Create Class (Admin)
          </button>
        )}
      </header>
    </>
  );
}
