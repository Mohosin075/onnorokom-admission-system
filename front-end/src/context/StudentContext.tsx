import React, { createContext, useContext, useState, useEffect } from 'react';

interface StudentContextType {
  studentId: string;
  setStudentId: (id: string) => void;
  isValidStudentId: boolean;
  activeHoldId: string | null;
  setActiveHoldId: (holdId: string | null) => void;
}

const StudentContext = createContext<StudentContextType | undefined>(undefined);

const STORAGE_KEY_STUDENT_ID = 'school_admission_student_id';
const STORAGE_KEY_ACTIVE_HOLD = 'school_admission_active_hold_id';

export const StudentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [studentId, setStudentIdState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_STUDENT_ID) || '20152691234567890';
  });

  const [activeHoldId, setActiveHoldIdState] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_HOLD);
  });

  const isValidStudentId = /^\d{17}$/.test(studentId.trim());

  const setStudentId = (id: string) => {
    const trimmed = id.trim();
    setStudentIdState(trimmed);
    localStorage.setItem(STORAGE_KEY_STUDENT_ID, trimmed);
  };

  const setActiveHoldId = (holdId: string | null) => {
    setActiveHoldIdState(holdId);
    if (holdId) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_HOLD, holdId);
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_HOLD);
    }
  };

  useEffect(() => {
    if (studentId) {
      localStorage.setItem(STORAGE_KEY_STUDENT_ID, studentId);
    }
  }, [studentId]);

  return (
    <StudentContext.Provider
      value={{
        studentId,
        setStudentId,
        isValidStudentId,
        activeHoldId,
        setActiveHoldId,
      }}
    >
      {children}
    </StudentContext.Provider>
  );
};

export const useStudent = (): StudentContextType => {
  const context = useContext(StudentContext);
  if (!context) {
    throw new Error('useStudent must be used within a StudentProvider');
  }
  return context;
};
