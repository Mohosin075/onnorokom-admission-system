import { createContext, useContext } from 'react';

export interface StudentContextType {
  studentId: string;
  setStudentId: (id: string) => void;
  isValidStudentId: boolean;
  activeHoldId: string | null;
  setActiveHoldId: (holdId: string | null) => void;
}
export const StudentContext = createContext<StudentContextType | undefined>(undefined);
export function useStudent(): StudentContextType {
  const context = useContext(StudentContext);
  if (!context) throw new Error('useStudent must be used within a StudentProvider');
  return context;
}
