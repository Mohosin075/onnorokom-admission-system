import React from 'react';
import { useStudent } from '../context/StudentContext';
import { School, UserCheck, AlertCircle, ShieldAlert } from 'lucide-react';

interface NavbarProps {
  onOpenCreateClass: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenCreateClass }) => {
  const { studentId, setStudentId, isValidStudentId } = useStudent();

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Logo & School Title */}
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600 text-white p-2.5 rounded-xl shadow-md">
              <School className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">
                School Admission System
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                First-Come, First-Served Admission Portal
              </p>
            </div>
          </div>

          {/* Student Identity Input & Admin Action */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
              <label htmlFor="student-id" className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Student ID:
              </label>
              <input
                id="student-id"
                type="text"
                maxLength={17}
                value={studentId}
                onChange={(e) => setStudentId(e.target.value.replace(/\D/g, ''))}
                placeholder="17-digit Birth Reg No"
                className="bg-transparent text-sm font-mono font-medium text-slate-800 placeholder-slate-400 focus:outline-none w-48"
              />
              {isValidStudentId ? (
                <span title="Valid 17-digit ID" className="flex items-center text-emerald-600 text-xs font-medium">
                  <UserCheck className="w-4 h-4 mr-0.5" />
                  <span className="hidden sm:inline">Valid</span>
                </span>
              ) : (
                <span title="Must be exactly 17 digits" className="flex items-center text-amber-600 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 mr-0.5" />
                  <span className="hidden sm:inline">{studentId.length}/17</span>
                </span>
              )}
            </div>

            <button
              onClick={onOpenCreateClass}
              className="inline-flex items-center justify-center px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm"
            >
              + Create Class (Admin)
            </button>
          </div>

        </div>

        {/* Validation Warning Notice if not 17 digits */}
        {!isValidStudentId && (
          <div className="mt-2.5 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-md border border-amber-200">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>
              Please enter a valid <strong>17-digit</strong> Birth Registration Number to apply for seats or confirm admission.
            </span>
          </div>
        )}
      </div>
    </header>
  );
};

