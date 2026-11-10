import { LanguageProvider } from "./context/language";
import { useLanguage } from "./context/language-store";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type KeyboardEvent,
} from "react";
import { StudentProvider } from "./context/StudentContext";
import { useStudent } from "./context/student-store";
import { Navbar } from "./components/Navbar";
import { ClassList } from "./components/ClassList";
import { EnrollmentWizard } from "./components/EnrollmentWizard";
import { StudentIdentityInput } from "./components/StudentIdentityInput";
import { MyApplications } from "./components/MyApplications";
import { CreateClassModal } from "./components/CreateClassModal";
import { AdmissionDetailsModal } from "./components/AdmissionDetailsModal";
import { api, getErrorMessage } from "./services/api";
import type { ClassItem, HoldItem } from "./types";
import { Check, Clock3, Layers, Users } from "lucide-react";
import "./assessment.css";

type Enrollment = {
  classId: string | null;
  holdId: string | null;
  owner: string | null;
  session: number;
};
type StudentTab = "browse" | "applications";

function MainDashboard() {
  const { t, language } = useLanguage();
  const { studentId, setStudentId, activeHoldId, setActiveHoldId } =
    useStudent();
  const [workspace, setWorkspace] = useState<"student" | "admin">("student");
  const [tab, setTab] = useState<StudentTab>("browse");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(() =>
    activeHoldId
      ? { classId: null, holdId: activeHoldId, owner: studentId, session: 0 }
      : null,
  );
  const enrollmentSession = useRef(0);
  const enrollmentSection = useRef<HTMLDivElement>(null);
  const restoredIdentity = useRef<string | null>(null);
  const manualNavigationIdentity = useRef<string | null>(null);
  const manualEnrollmentActive = useRef(false);
  const currentIdentity = useRef(studentId);
  const currentHoldId = useRef(activeHoldId);
  useEffect(() => {
    currentIdentity.current = studentId;
    currentHoldId.current = activeHoldId;
  }, [studentId, activeHoldId]);
  const enrollmentVisible = Boolean(
    enrollment && (!enrollment.owner || enrollment.owner === studentId),
  );
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [applicationSnapshot, setApplicationSnapshot] = useState<{
    studentId: string;
    holds: HoldItem[];
  }>({ studentId: "", holds: [] });
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [admissionDetails, setAdmissionDetails] = useState<{
    studentId: string;
    hold: HoldItem;
  } | null>(null);
  const [refreshApplicationsTrigger, setRefreshApplicationsTrigger] =
    useState(0);
  const classRequest = useRef(0);
  const classFetching = useRef(false);
  const studentApplications =
    applicationSnapshot.studentId === studentId
      ? applicationSnapshot.holds
      : [];

  const fetchClasses = useCallback(async (background = false) => {
    if (classFetching.current) return;
    classFetching.current = true;
    const request = ++classRequest.current;
    if (!background) setLoadingClasses(true);
    try {
      const data = await api.getClasses();
      if (request !== classRequest.current) return;
      setClasses(data);
      setConnectionError(null);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (error) {
      if (request === classRequest.current)
        setConnectionError(getErrorMessage(error));
    } finally {
      classFetching.current = false;
      if (request === classRequest.current) setLoadingClasses(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => {
      void fetchClasses();
    }, 0);
    const interval = setInterval(() => {
      void fetchClasses(true);
    }, 3000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [fetchClasses]);

  const handleApplicationsLoaded = useCallback(
    (identity: string, holds: HoldItem[]) => {
      if (identity !== currentIdentity.current) return;
      setApplicationSnapshot({ studentId: identity, holds });
      // Restore once per identity, so returning to the catalog never reopens the wizard.
      if (restoredIdentity.current === identity) return;
      restoredIdentity.current = identity;
      if (
        currentHoldId.current ||
        manualEnrollmentActive.current ||
        manualNavigationIdentity.current === identity
      )
        return;
      const saved = holds.find(
        (hold) =>
          hold.status === "HELD" &&
          new Date(hold.expiresAt).getTime() > Date.now(),
      );
      if (saved) {
        setActiveHoldId(saved.holdId);
        setEnrollment({
          classId: saved.classId,
          holdId: saved.holdId,
          owner: identity,
          session: ++enrollmentSession.current,
        });
      }
    },
    [setActiveHoldId],
  );

  useEffect(() => {
    if (enrollmentVisible && tab === "browse" && workspace === "student")
      enrollmentSection.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      });
  }, [enrollmentVisible, enrollment?.session, tab, workspace]);

  const updateApplication = (updated?: HoldItem) => {
    if (updated)
      setApplicationSnapshot((snapshot) => ({
        studentId,
        holds: [
          ...(snapshot.studentId === studentId
            ? snapshot.holds.filter((hold) => hold.holdId !== updated.holdId)
            : []),
          updated,
        ],
      }));
    void fetchClasses(true);
    setRefreshApplicationsTrigger((value) => value + 1);
  };
  const browseClasses = () => {
    manualEnrollmentActive.current = false;
    manualNavigationIdentity.current = studentId;
    setEnrollment(null);
    setTab("browse");
  };
  const startEnrollment = (item: ClassItem) => {
    manualEnrollmentActive.current = true;
    manualNavigationIdentity.current = "";
    setStudentId("");
    setActiveHoldId(null);
    setAdmissionDetails(null);
    setEnrollment({
      classId: item.id,
      holdId: null,
      owner: null,
      session: ++enrollmentSession.current,
    });
    setTab("browse");
  };
  const startNewStudent = () => {
    manualEnrollmentActive.current = true;
    manualNavigationIdentity.current = "";
    setStudentId("");
    setActiveHoldId(null);
    setAdmissionDetails(null);
    setEnrollment({
      classId: null,
      holdId: null,
      owner: null,
      session: ++enrollmentSession.current,
    });
    setTab("browse");
    setWorkspace("student");
  };
  const selectApplication = (holdId: string) => {
    manualNavigationIdentity.current = studentId;
    const saved = studentApplications.find((hold) => hold.holdId === holdId);
    if (saved?.status === "CONFIRMED") {
      setAdmissionDetails({ studentId, hold: saved });
      return;
    }
    setActiveHoldId(holdId);
    setEnrollment({
      classId: saved?.classId ?? null,
      holdId,
      owner: studentId,
      session: ++enrollmentSession.current,
    });
    setTab("browse");
  };
  const moveTab = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const current = tabs.indexOf(event.target as HTMLButtonElement);
    if (current < 0) return;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : event.key === "ArrowRight"
            ? (current + 1) % tabs.length
            : event.key === "ArrowLeft"
              ? (current + tabs.length - 1) % tabs.length
              : -1;
    if (next < 0) return;
    event.preventDefault();
    setTab(next === 0 ? "browse" : "applications");
    tabs[next].focus();
  };

  return (
    <div className="admission-shell" lang={language}>
      <a className="admission-skip" href="#main-content">
        {t("Skip to content")}
      </a>
      <Navbar
        onNewStudent={startNewStudent}
        onFindApplications={() => {
          setWorkspace("student");
          setTab("applications");
        }}
        workspace={workspace}
        onWorkspaceChange={setWorkspace}
        onOpenCreateClass={() => setIsCreateModalOpen(true)}
      />
      <main id="main-content" className="admission-main">
        <section
          aria-label={t("Workspace introduction")}
          className="admission-simple-intro admission-tab-intro"
        >
          <div>
            <h1>
              {workspace === "student"
                ? t("Apply for admission")
                : t("Manage classes and seats")}
            </h1>
            <p>
              {workspace === "student"
                ? t(
                    "For a new student, select New student admission. To return to an application, open My applications.",
                  )
                : t(
                    "Add a class and set its total seats. Seat counts update automatically as students apply.",
                  )}
            </p>
          </div>
          {workspace === "admin" && (
            <p className="admission-public-note">
              {t(
                "This public assessment workspace does not require an admin login.",
              )}
            </p>
          )}
        </section>
        {workspace === "admin" && (
          <dl className="admission-metrics">
            {[
              {
                label: t("Classes"),
                value: classes.length,
                icon: Layers,
                tone: "neutral",
              },
              {
                label: t("Available seats"),
                value: classes.reduce(
                  (sum, item) => sum + item.availableSeats,
                  0,
                ),
                icon: Users,
                tone: "green",
              },
              {
                label: t("Waiting for payment"),
                value: classes.reduce((sum, item) => sum + item.heldSeats, 0),
                icon: Clock3,
                tone: "amber",
              },
              {
                label: t("Students admitted"),
                value: classes.reduce(
                  (sum, item) => sum + item.confirmedSeats,
                  0,
                ),
                icon: Check,
                tone: "green",
              },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className={`admission-metric ${tone}`}>
                <Icon size={19} />
                <dt>{label}</dt>
                <dd>{loadingClasses ? "—" : value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="admission-content-nav">
          <div
            role="tablist"
            aria-label={t("Admission views")}
            onKeyDown={moveTab}
            hidden={workspace !== "student"}
          >
            <button
              role="tab"
              id="browse-tab"
              aria-selected={tab === "browse"}
              aria-controls="browse-panel"
              tabIndex={tab === "browse" ? 0 : -1}
              onClick={() => setTab("browse")}
            >
              {t("Browse classes")}
            </button>
            <button
              role="tab"
              id="applications-tab"
              aria-selected={tab === "applications"}
              aria-controls="applications-panel"
              tabIndex={tab === "applications" ? 0 : -1}
              onClick={() => setTab("applications")}
            >
              {t("My applications")}
            </button>
          </div>
          {workspace === "admin" && <strong>{t("Class directory")}</strong>}
          <span>
            {connectionError
              ? t("Connection interrupted")
              : lastUpdated
                ? t("Updated {time}", { time: lastUpdated })
                : t("Connecting…")}
          </span>
        </div>
        {connectionError && (
          <div role="alert" className="admission-history-error">
            {t(connectionError)}{" "}
            {t(
              "Seat counts may be out of date. Please wait for the connection to return before applying.",
            )}
            {lastUpdated && (
              <span> {t("Last updated: {time}.", { time: lastUpdated })}</span>
            )}
            <button
              className="admission-retry"
              onClick={() => void fetchClasses(true)}
            >
              {t("Try again")}
            </button>
          </div>
        )}

        <div hidden={workspace !== "student"}>
          <section
            role="tabpanel"
            id="browse-panel"
            aria-labelledby="browse-tab"
            hidden={tab !== "browse"}
            tabIndex={0}
          >
            <div ref={enrollmentSection}>
              {enrollmentVisible && enrollment && (
                <EnrollmentWizard
                  key={enrollment.session}
                  classId={enrollment.classId}
                  initialHoldId={enrollment.holdId}
                  classes={classes}
                  classesLoading={loadingClasses}
                  connected={!connectionError}
                  onReserved={(hold) => {
                    setActiveHoldId(hold.holdId);
                    setEnrollment((current) =>
                      current
                        ? { ...current, holdId: hold.holdId, owner: studentId }
                        : current,
                    );
                    updateApplication(hold);
                  }}
                  onUpdated={updateApplication}
                  onCancelled={() => {
                    setActiveHoldId(null);
                    browseClasses();
                    updateApplication();
                  }}
                  onBrowse={browseClasses}
                  onViewApplications={() => setTab("applications")}
                  onViewAdmission={(hold) =>
                    setAdmissionDetails({ studentId, hold })
                  }
                />
              )}
            </div>
            <div hidden={enrollmentVisible}>
              {activeHoldId && (
                <div className="admission-resume-notice">
                  <p>
                    {t("You have a saved application. View its latest status.")}
                  </p>
                  <button
                    className="admission-secondary"
                    onClick={() => selectApplication(activeHoldId)}
                  >
                    {t("View your application")}
                  </button>
                </div>
              )}
              <section aria-label={t("Class and Shifts List")}>
                <ClassList
                  connected={!connectionError}
                  classes={classes}
                  loading={loadingClasses}
                  onStartEnrollment={startEnrollment}
                />
              </section>
            </div>
          </section>
          <section
            role="tabpanel"
            id="applications-panel"
            aria-labelledby="applications-tab"
            hidden={tab !== "applications"}
            tabIndex={0}
          >
            {tab === "applications" && workspace === "student" && (
              <div className="admission-application-lookup">
                <h2>{t("Find your applications")}</h2>
                <p>
                  {t(
                    "Enter the birth registration number used for your application. Your applications will appear below.",
                  )}
                </p>
                <StudentIdentityInput id="history-student-id" />
              </div>
            )}
            <section
              id="my-applications"
              aria-label={t("My Applications History")}
            >
              <MyApplications
                key={studentId}
                onApplicationsLoaded={handleApplicationsLoaded}
                onSelectHold={selectApplication}
                onBrowseClasses={browseClasses}
                refreshTrigger={refreshApplicationsTrigger}
              />
            </section>
          </section>
        </div>
        {workspace === "admin" && (
          <section aria-label={t("Class and Shifts List")}>
            <ClassList
              management
              classes={classes}
              loading={loadingClasses}
              connected={!connectionError}
              onStartEnrollment={startEnrollment}
            />
          </section>
        )}
      </main>
      <footer className="admission-footer">
        <p>
          {t("School Admission System")}{" "}
          <span>{t("First-come, first-served · No account required")}</span>
        </p>
      </footer>
      {admissionDetails &&
        admissionDetails.studentId === studentId &&
        workspace === "student" && (
          <AdmissionDetailsModal
            admission={admissionDetails.hold}
            studentId={studentId}
            className={
              admissionDetails.hold.className ??
              classes.find((item) => item.id === admissionDetails.hold.classId)
                ?.name ??
              admissionDetails.hold.classId
            }
            onClose={() => setAdmissionDetails(null)}
          />
        )}
      {isCreateModalOpen && (
        <CreateClassModal
          isOpen
          onClose={() => setIsCreateModalOpen(false)}
          onClassCreated={() => {
            void fetchClasses();
            setRefreshApplicationsTrigger((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <StudentProvider>
        <MainDashboard />
      </StudentProvider>
    </LanguageProvider>
  );
}
