import { useCallback, useState, type ReactNode } from 'react';
import { StudentContext } from './student-store';

const STUDENT_KEY = 'school_admission_student_id';
const HOLD_KEY = 'school_admission_active_hold_id';
function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch { /* Continue the session when browser storage is unavailable. */ }
}
export function StudentProvider({ children }: { children: ReactNode }) {
  const [studentId, setStudentIdState] = useState(() => readStorage(STUDENT_KEY) || '');
  const [activeHoldId, setActiveHoldIdState] = useState(() =>
    /^\d{17}$/.test(readStorage(STUDENT_KEY) || '') ? readStorage(HOLD_KEY) : null);
  const setActiveHoldId = useCallback((id: string | null) => {
    setActiveHoldIdState(id);
    writeStorage(HOLD_KEY, id);
  }, []);
  const setStudentId = useCallback((value: string) => {
    const id = value.trim();
    if (id !== studentId) setActiveHoldId(null);
    setStudentIdState(id);
    writeStorage(STUDENT_KEY, id);
  }, [studentId, setActiveHoldId]);
  return (
    <StudentContext.Provider value={{ studentId, setStudentId,
      isValidStudentId: /^\d{17}$/.test(studentId), activeHoldId, setActiveHoldId }}>
      {children}
    </StudentContext.Provider>
  );
}
