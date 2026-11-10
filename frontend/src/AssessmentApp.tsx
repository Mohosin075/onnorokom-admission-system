import React, { useState, useEffect, useCallback, useRef } from "react";
import { StudentProvider } from "./context/StudentContext";
import { useStudent } from "./context/student-store";
import { Navbar } from "./components/Navbar";
import { ClassList } from "./components/ClassList";
import { ActiveHoldCard } from "./components/ActiveHoldCard";
import { MyApplications } from "./components/MyApplications";
import { CreateClassModal } from "./components/CreateClassModal";
import { api, getErrorMessage } from "./services/api";
import type { ClassItem, HoldItem } from "./types";
import "./assessment.css";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Clock3,
  Layers,
  Users,
  X,
} from "lucide-react";

const MainDashboard: React.FC = () => {
  const { studentId, isValidStudentId, activeHoldId, setActiveHoldId } =
    useStudent();
  const [workspace, setWorkspace] = useState<"student" | "admin">("student");
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [applicationSnapshot, setApplicationSnapshot] = useState<{
    studentId: string;
    holds: HoldItem[];
  }>({ studentId: "", holds: [] });
  const handleApplicationsLoaded = useCallback(
    (identity: string, holds: HoldItem[]) => {
      setApplicationSnapshot({ studentId: identity, holds });
    },
    [],
  );
  const [loadingClasses, setLoadingClasses] = useState<boolean>(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [refreshApplicationsTrigger, setRefreshApplicationsTrigger] =
    useState<number>(0);
  const bookingSection = useRef<HTMLElement>(null);
  const focusBooking = useRef(false);
  const classRequest = useRef(0);
  const classFetching = useRef(false);

  // Fetch classes list
  const fetchClasses = useCallback(async (isBackground = false) => {
    if (classFetching.current) return;
    classFetching.current = true;
    const request = ++classRequest.current;
    if (!isBackground) setLoadingClasses(true);
    try {
      const data = await api.getClasses();
      if (request !== classRequest.current) return;
      setClasses(data);
      setConnectionError(null);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      if (request === classRequest.current)
        setConnectionError(getErrorMessage(err));
    } finally {
      classFetching.current = false;
      if (request === classRequest.current) setLoadingClasses(false);
    }
  }, []);

  // Auto-restore active hold from server if valid student ID is set but activeHoldId is empty
  useEffect(() => {
    let disposed = false;
    if (!activeHoldId && studentId && /^\d{17}$/.test(studentId)) {
      api
        .getMyHolds(studentId)
        .then((myHolds) => {
          if (disposed) return;
          const currentActive = myHolds.find(
            (h) =>
              h.status === "HELD" &&
              new Date(h.expiresAt).getTime() > Date.now(),
          );
          if (currentActive) {
            setActiveHoldId(currentActive.holdId);
          }
        })
        .catch((error: unknown) => {
          if (!disposed) setGlobalError(getErrorMessage(error));
        });
    }
    return () => {
      disposed = true;
    };
  }, [studentId, activeHoldId, setActiveHoldId]);

  // Initial fetch and auto-refresh polling every 3 seconds (Mandatory UI Rule 3)
  useEffect(() => {
    const initial = setTimeout(() => {
      void fetchClasses(false);
    }, 0);
    const interval = setInterval(() => {
      fetchClasses(true);
    }, 3000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [fetchClasses]);

  useEffect(() => {
    if (!focusBooking.current || !activeHoldId || workspace !== "student")
      return;
    bookingSection.current?.focus({ preventScroll: true });
    bookingSection.current?.scrollIntoView?.({
      behavior: "smooth",
      block: "start",
    });
    focusBooking.current = false;
  }, [activeHoldId, workspace]);

  const handleHoldCreated = (holdId: string) => {
    focusBooking.current = true;
    setActiveHoldId(holdId);
    setRefreshApplicationsTrigger((prev) => prev + 1);
    fetchClasses(true);
  };

  const handleHoldUpdated = () => {
    fetchClasses(true);
    setRefreshApplicationsTrigger((prev) => prev + 1);
  };

  const handleHoldDismissed = () => {
    setActiveHoldId(null);
    fetchClasses(true);
    setRefreshApplicationsTrigger((prev) => prev + 1);
  };

  const selectApplication = (holdId: string) => {
    focusBooking.current = true;
    setActiveHoldId(holdId);
    if (activeHoldId === holdId) {
      bookingSection.current?.focus({ preventScroll: true });
      bookingSection.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      });
      focusBooking.current = false;
    }
  };

  return (
    <div className="admission-shell">
      <a className="admission-skip" href="#main-content">
        Skip to content
      </a>
      <Navbar
        workspace={workspace}
        onWorkspaceChange={setWorkspace}
        onOpenCreateClass={() => setIsCreateModalOpen(true)}
      />

      {/* Global Error Banner */}
      {globalError && (
        <div className="admission-alert-wrap">
          <div
            role="alert"
            className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center space-x-2 text-sm">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              <span>{globalError}</span>
            </div>
            <button
              aria-label="Dismiss error"
              onClick={() => setGlobalError(null)}
              className="text-rose-500 hover:text-rose-700 p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main id="main-content" className="admission-main">
        <section
          aria-label="Workspace introduction"
          className="admission-simple-intro"
        >
          <div>
            <h1>
              {workspace === "student"
                ? "Apply for admission"
                : "Manage classes and seats"}
            </h1>
            <p>
              {workspace === "student"
                ? "Enter your birth registration number, choose a class, then pay the admission fee to confirm your seat."
                : "Add a class and set its total seats. Seat counts update automatically as students apply."}
            </p>
          </div>
          {workspace === "student" && (
            <div className="admission-next-action">
              {!isValidStudentId ? (
                <button
                  className="admission-primary"
                  onClick={() => {
                    const input = document.getElementById("student-id");
                    input?.focus({ preventScroll: true });
                    input?.scrollIntoView?.({
                      behavior: "smooth",
                      block: "center",
                    });
                  }}
                >
                  Start with your birth registration number
                </button>
              ) : (
                <a
                  className="admission-primary"
                  href={
                    activeHoldId ? "#active-application" : "#class-directory"
                  }
                >
                  {activeHoldId ? "View your application" : "Choose a class"}
                  <ArrowUpRight size={16} />
                </a>
              )}
              <small>
                {!isValidStudentId
                  ? "Use the 17-digit number on your birth certificate. No account needed."
                  : "Use the same number each time to find your applications."}
              </small>
            </div>
          )}
          {workspace === "student" ? (
            <ol className="admission-simple-steps" aria-label="How to apply">
              <li>
                <span>1</span>Enter your number
              </li>
              <li>
                <span>2</span>Choose a class
              </li>
              <li>
                <span>3</span>Pay to confirm
              </li>
            </ol>
          ) : (
            <p className="admission-public-note">
              This public assessment workspace does not require an admin login.
            </p>
          )}
        </section>
        {workspace === "admin" && (
          <dl className="admission-metrics">
            {[
              {
                label: "Classes",
                value: classes.length,
                icon: Layers,
                tone: "neutral",
              },
              {
                label: "Available seats",
                value: classes.reduce((n, c) => n + c.availableSeats, 0),
                icon: Users,
                tone: "green",
              },
              {
                label: "Waiting for payment",
                value: classes.reduce((n, c) => n + c.heldSeats, 0),
                icon: Clock3,
                tone: "amber",
              },
              {
                label: "Students admitted",
                value: classes.reduce((n, c) => n + c.confirmedSeats, 0),
                icon: Check,
                tone: "green",
              },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className={"admission-metric " + tone}>
                <Icon size={19} />
                <dt>{label}</dt>
                <dd>{loadingClasses ? "\u2014" : value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="admission-content-nav">
          <nav aria-label="Page sections">
            <a href="#class-directory">
              {workspace === "student" ? "Browse classes" : "Class directory"}
            </a>
            {workspace === "student" && (
              <a href="#my-applications">
                My applications <ArrowUpRight size={13} />
              </a>
            )}
          </nav>
          <span>
            {connectionError
              ? "Connection interrupted"
              : lastUpdated
                ? "Updated " + lastUpdated
                : "Connecting…"}
          </span>
        </div>
        {connectionError && (
          <div
            role="alert"
            className="p-4 rounded-xl bg-amber-50 text-amber-900 border border-amber-200"
          >
            {connectionError} Seat counts may be out of date. Please wait for
            the connection to return before applying.
            {lastUpdated && <span> Last updated: {lastUpdated}.</span>}
            <button
              className="admission-retry"
              onClick={() => void fetchClasses(true)}
            >
              Try again
            </button>
          </div>
        )}
        {/* Active Application / Countdown Screen */}
        {workspace === "student" && activeHoldId && (
          <section
            id="active-application"
            ref={bookingSection}
            tabIndex={-1}
            aria-label="Active Application Status"
          >
            <ActiveHoldCard
              key={`${studentId}:${activeHoldId}`}
              holdId={activeHoldId}
              classes={classes}
              onHoldUpdated={handleHoldUpdated}
              onHoldDismissed={handleHoldDismissed}
              onError={(msg) => setGlobalError(msg)}
            />
          </section>
        )}

        {/* Classes Table / Seat Status Screen */}
        <section id="class-directory" aria-label="Class and Shifts List">
          <ClassList
            key={`${workspace}:${studentId}`}
            management={workspace === "admin"}
            applications={
              applicationSnapshot.studentId === studentId
                ? applicationSnapshot.holds
                : []
            }
            onSelectHold={selectApplication}
            connected={!connectionError}
            classes={classes}
            loading={loadingClasses}
            onHoldCreated={handleHoldCreated}
            onError={(msg) => setGlobalError(msg)}
          />
        </section>

        {/* My Applications History Screen */}
        {workspace === "student" && (
          <section id="my-applications" aria-label="My Applications History">
            <MyApplications
              onApplicationsLoaded={handleApplicationsLoaded}
              key={studentId}
              onSelectHold={selectApplication}
              refreshTrigger={refreshApplicationsTrigger}
            />
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="admission-footer">
        <p>
          School Admission System{" "}
          <span>First-come, first-served · No account required</span>
        </p>
      </footer>

      {/* Create Class Admin Modal */}
      {isCreateModalOpen && (
        <CreateClassModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onClassCreated={() => {
            fetchClasses(false);
            setRefreshApplicationsTrigger((prev) => prev + 1);
          }}
        />
      )}
    </div>
  );
};

export default function App() {
  return (
    <StudentProvider>
      <MainDashboard />
    </StudentProvider>
  );
}
