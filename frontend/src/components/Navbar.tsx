import {
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
            School admissions<small>Apply and track your admission</small>
          </span>
        </a>
        <p className="admission-nav-label">MENU</p>
        <nav aria-label="Workspace" className="admission-workspaces">
          <button
            aria-label="Student admissions"
            aria-pressed={workspace === "student"}
            onClick={() => onWorkspaceChange("student")}
          >
            <BookOpen size={19} />
            <span>
              Student admissions<small>Apply or check your application</small>
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
              Admin workspace<small>Add classes and check seats</small>
            </span>
            {workspace === "admin" && <span className="admission-nav-dot" />}
          </button>
        </nav>
        <div className="admission-sidebar-note">
          <span className="admission-eyebrow">NEED TO COME BACK LATER?</span>
          <p>Your number is all you need.</p>
          <small>
            Enter the same birth registration number to see your applications.
            An unpaid seat is only kept until its payment deadline.
          </small>
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
              ? "Choose a class or check an existing application."
              : "Add classes and see how many seats are left."}
          </p>
        </div>
        {workspace === "student" ? (
          <div className="admission-identity">
            <label htmlFor="student-id">Birth registration number</label>
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
                  setStudentId(
                    e.target.value
                      .replace(/[\u09e6-\u09ef]/g, (digit) =>
                        String(digit.charCodeAt(0) - 0x09e6),
                      )
                      .replace(/\D/g, ""),
                  )
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
                ? "Your number is ready. Choose a class below."
                : studentId.length + " of 17 digits entered"}
            </small>
          </div>
        ) : (
          <button className="admission-primary" onClick={onOpenCreateClass}>
            <Plus size={17} /> Add a class
          </button>
        )}
      </header>
    </>
  );
}
