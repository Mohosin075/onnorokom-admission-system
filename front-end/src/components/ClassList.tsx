import React, { useState } from 'react';
import type { ClassItem } from '../types';
import { useStudent } from '../context/StudentContext';
import { api, getErrorMessage } from '../services/api';
import { Users, CheckCircle, Clock, Sparkles } from 'lucide-react';

interface ClassListProps {
  classes: ClassItem[];
  loading: boolean;
  onHoldCreated: (holdId: string) => void;
  onError: (msg: string) => void;
}

export const ClassList: React.FC<ClassListProps> = ({
  classes,
  loading,
  onHoldCreated,
  onError,
}) => {
  const { studentId, isValidStudentId } = useStudent();
  const [holdingId, setHoldingId] = useState<string | null>(null);

  const handleApply = async (classItem: ClassItem) => {
    if (!isValidStudentId) {
      onError('Please enter a valid 17-digit Birth Registration Number at the top before applying.');
      return;
    }

    if (classItem.availableSeats <= 0) {
      onError(`Sorry, no seats available for ${classItem.name}.`);
      return;
    }

    setHoldingId(classItem.id);
    try {
      const response = await api.createHold(classItem.id, studentId);
      onHoldCreated(response.holdId);
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setHoldingId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Available Classes & Shifts</h2>
          <p className="text-xs text-slate-500">Live seat availability updates automatically every few seconds</p>
        </div>
        <div className="flex items-center space-x-1.5 text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full font-medium border border-emerald-100">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Live Sync</span>
        </div>
      </div>

      {loading && classes.length === 0 ? (
        <div className="p-12 text-center text-slate-400">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-3"></div>
          <p className="text-sm">Loading classes...</p>
        </div>
      ) : classes.length === 0 ? (
        <div className="p-12 text-center text-slate-500">
          <p className="text-base font-semibold mb-1">No classes found</p>
          <p className="text-sm text-slate-400 mb-4">Click "Create Class" at the top to add your first admission shift.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {classes.map((cls) => {
            const isFull = cls.availableSeats <= 0;
            const isApplying = holdingId === cls.id;

            return (
              <div
                key={cls.id}
                className="p-5 sm:p-6 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center md:justify-between gap-4"
              >
                {/* Class Details */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-slate-900">{cls.name}</h3>
                    {isFull && (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-rose-100 text-rose-700">
                        Class Full
                      </span>
                    )}
                  </div>

                  {/* Seat Statistics Badge Grid */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium">
                      <Users className="w-3.5 h-3.5 mr-1 text-slate-400" />
                      Total: <strong className="ml-1 text-slate-900">{cls.totalSeats}</strong>
                    </span>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 font-medium border border-amber-100">
                      <Clock className="w-3.5 h-3.5 mr-1 text-amber-500" />
                      Held: <strong className="ml-1">{cls.heldSeats}</strong>
                    </span>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 font-medium border border-blue-100">
                      <CheckCircle className="w-3.5 h-3.5 mr-1 text-blue-500" />
                      Confirmed: <strong className="ml-1">{cls.confirmedSeats}</strong>
                    </span>
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-lg font-bold border ${
                        cls.availableSeats > 0
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1" />
                      Available: <span className="ml-1 text-sm">{cls.availableSeats}</span>
                    </span>
                  </div>
                </div>

                {/* Apply Button */}
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => handleApply(cls)}
                    disabled={isFull || isApplying || !isValidStudentId}
                    className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center justify-center space-x-2 ${
                      isFull
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : !isValidStudentId
                        ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 hover:shadow-md'
                    }`}
                  >
                    {isApplying ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Holding Seat...</span>
                      </>
                    ) : isFull ? (
                      <span>Seats Filled</span>
                    ) : (
                      <span>Apply Now (Hold Seat)</span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
