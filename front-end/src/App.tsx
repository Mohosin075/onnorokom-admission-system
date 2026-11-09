import React, { useState, useEffect, useCallback } from 'react';
import { StudentProvider, useStudent } from './context/StudentContext';
import { Navbar } from './components/Navbar';
import { ClassList } from './components/ClassList';
import { ActiveHoldCard } from './components/ActiveHoldCard';
import { MyApplications } from './components/MyApplications';
import { CreateClassModal } from './components/CreateClassModal';
import { api, getErrorMessage } from './services/api';
import type { ClassItem } from './types';
import { AlertCircle, X } from 'lucide-react';

const MainDashboard: React.FC = () => {
  const { studentId, activeHoldId, setActiveHoldId } = useStudent();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loadingClasses, setLoadingClasses] = useState<boolean>(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [refreshApplicationsTrigger, setRefreshApplicationsTrigger] = useState<number>(0);

  // Fetch classes list
  const fetchClasses = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoadingClasses(true);
    try {
      const data = await api.getClasses();
      setClasses(data);
    } catch (err) {
      if (!isBackground) {
        setGlobalError(getErrorMessage(err));
      }
    } finally {
      if (!isBackground) setLoadingClasses(false);
    }
  }, []);

  // Auto-restore active hold from server if valid student ID is set but activeHoldId is empty
  useEffect(() => {
    if (!activeHoldId && studentId && /^\d{17}$/.test(studentId)) {
      api.getMyHolds(studentId).then((myHolds) => {
        const currentActive = myHolds.find(
          (h) => h.status === 'HELD' && new Date(h.expiresAt).getTime() > Date.now()
        );
        if (currentActive) {
          setActiveHoldId(currentActive.holdId);
        }
      }).catch(() => {
        // Silently ignore on background recovery
      });
    }
  }, [studentId, activeHoldId, setActiveHoldId]);

  // Initial fetch and auto-refresh polling every 3 seconds (Mandatory UI Rule 3)
  useEffect(() => {
    fetchClasses(false);
    const interval = setInterval(() => {
      fetchClasses(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchClasses]);

  const handleHoldCreated = (holdId: string) => {
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar onOpenCreateClass={() => setIsCreateModalOpen(true)} />

      {/* Global Error Banner */}
      {globalError && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-4">
          <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-2 text-sm">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              <span>{globalError}</span>
            </div>
            <button
              onClick={() => setGlobalError(null)}
              className="text-rose-500 hover:text-rose-700 p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8 flex-1">
        {/* Active Application / Countdown Screen */}
        {activeHoldId && (
          <section aria-label="Active Application Status">
            <ActiveHoldCard
              holdId={activeHoldId}
              classes={classes}
              onHoldUpdated={handleHoldUpdated}
              onHoldDismissed={handleHoldDismissed}
              onError={(msg) => setGlobalError(msg)}
            />
          </section>
        )}

        {/* Classes Table / Seat Status Screen */}
        <section aria-label="Class and Shifts List">
          <ClassList
            classes={classes}
            loading={loadingClasses}
            onHoldCreated={handleHoldCreated}
            onError={(msg) => setGlobalError(msg)}
          />
        </section>

        {/* My Applications History Screen */}
        <section aria-label="My Applications History">
          <MyApplications
            onSelectHold={(holdId) => {
              setActiveHoldId(holdId);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            refreshTrigger={refreshApplicationsTrigger}
          />
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <p>School Admission System &bull; OnnoRokom Projukti Recruitment Assessment</p>
      </footer>

      {/* Create Class Admin Modal */}
      <CreateClassModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onClassCreated={() => {
          fetchClasses(false);
          setRefreshApplicationsTrigger((prev) => prev + 1);
        }}
      />
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
