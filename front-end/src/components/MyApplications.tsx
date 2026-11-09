import React, { useEffect, useState } from 'react';
import type { HoldItem } from '../types';
import { useStudent } from '../context/StudentContext';
import { api, getErrorMessage } from '../services/api';
import { FileText, RefreshCw, CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react';

interface MyApplicationsProps {
  onSelectHold: (holdId: string) => void;
  refreshTrigger: number;
}

export const MyApplications: React.FC<MyApplicationsProps> = ({
  onSelectHold,
  refreshTrigger,
}) => {
  const { studentId, isValidStudentId } = useStudent();
  const [holds, setHolds] = useState<HoldItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMyHolds = async () => {
    if (!isValidStudentId) {
      setHolds([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await api.getMyHolds(studentId);
      setHolds(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyHolds();
  }, [studentId, refreshTrigger]);

  const getStatusBadge = (status: string, expiresAt: string) => {
    const isActuallyExpired = status === 'EXPIRED' || (status === 'HELD' && new Date(expiresAt).getTime() < Date.now());

    if (status === 'CONFIRMED') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
          CONFIRMED
        </span>
      );
    }

    if (isActuallyExpired) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
          <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-600" />
          EXPIRED
        </span>
      );
    }

    if (status === 'CANCELLED') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-slate-200 text-slate-700">
          <XCircle className="w-3.5 h-3.5 mr-1 text-slate-500" />
          CANCELLED
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
        <Clock className="w-3.5 h-3.5 mr-1 text-amber-600 animate-spin" />
        HELD
      </span>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">My Applications History</h2>
            <p className="text-xs text-slate-500">
              Applications linked to student ID: <span className="font-mono font-medium text-slate-800">{studentId || 'None'}</span>
            </p>
          </div>
        </div>

        <button
          onClick={fetchMyHolds}
          disabled={loading || !isValidStudentId}
          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-40"
          title="Refresh Applications"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-xs text-red-700 border-b border-red-100">
          {error}
        </div>
      )}

      {!isValidStudentId ? (
        <div className="p-8 text-center text-slate-400">
          <p className="text-sm">Enter a valid 17-digit Student ID at the top to view your application history.</p>
        </div>
      ) : loading && holds.length === 0 ? (
        <div className="p-8 text-center text-slate-400">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs">Fetching applications...</p>
        </div>
      ) : holds.length === 0 ? (
        <div className="p-8 text-center text-slate-400">
          <p className="text-sm font-medium mb-1">No applications found for this student.</p>
          <p className="text-xs">Choose a class above and click "Apply Now" to reserve a seat.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-6 py-3 font-semibold">Hold ID</th>
                <th className="px-6 py-3 font-semibold">Class / Shift</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold">Expires / Held Until</th>
                <th className="px-6 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {holds.map((h) => {
                const isHeld = h.status === 'HELD' && new Date(h.expiresAt).getTime() > Date.now();
                return (
                  <tr key={h.holdId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-3.5 font-mono text-xs text-slate-600">{h.holdId}</td>
                    <td className="px-6 py-3.5 font-semibold text-slate-800">{h.className || h.classId}</td>
                    <td className="px-6 py-3.5">{getStatusBadge(h.status, h.expiresAt)}</td>
                    <td className="px-6 py-3.5 text-xs text-slate-500">
                      {new Date(h.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {isHeld ? (
                        <button
                          onClick={() => onSelectHold(h.holdId)}
                          className="px-3 py-1 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200"
                        >
                          View & Pay
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
