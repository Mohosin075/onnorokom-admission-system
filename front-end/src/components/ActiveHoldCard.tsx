import React, { useEffect, useState } from 'react';
import type { HoldItem, ClassItem } from '../types';
import { useStudent } from '../context/StudentContext';
import { api, getErrorMessage } from '../services/api';
import { Clock, CreditCard, XCircle, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface ActiveHoldCardProps {
  holdId: string;
  classes: ClassItem[];
  onHoldUpdated: () => void;
  onHoldDismissed: () => void;
  onError: (msg: string) => void;
}

export const ActiveHoldCard: React.FC<ActiveHoldCardProps> = ({
  holdId,
  classes,
  onHoldUpdated,
  onHoldDismissed,
  onError,
}) => {
  const { studentId } = useStudent();
  const [hold, setHold] = useState<HoldItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isExpiredLocal, setIsExpiredLocal] = useState(false);

  // Fetch hold details
  const fetchHold = async () => {
    try {
      const data = await api.getHoldById(holdId);
      setHold(data);
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHold();
    // Poll hold status every 4 seconds in case status changed on server
    const interval = setInterval(fetchHold, 4000);
    return () => clearInterval(interval);
  }, [holdId]);

  // Real-time Countdown Timer calculation
  useEffect(() => {
    if (!hold || !hold.expiresAt) return;

    const calculateRemaining = () => {
      const expiryTime = new Date(hold.expiresAt).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expiryTime - now) / 1000));
      setRemainingSeconds(diff);

      if (diff === 0 && hold.status === 'HELD') {
        setIsExpiredLocal(true);
      }
    };

    calculateRemaining();
    const timer = setInterval(calculateRemaining, 1000);
    return () => clearInterval(timer);
  }, [hold]);

  const handleConfirmPayment = async () => {
    if (!hold) return;
    setActionLoading(true);
    try {
      await api.confirmHold(hold.holdId, studentId);
      await fetchHold();
      onHoldUpdated();
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelHold = async () => {
    if (!hold) return;
    if (!window.confirm('Are you sure you want to cancel this application? The seat will be released immediately.')) {
      return;
    }
    setActionLoading(true);
    try {
      await api.cancelHold(hold.holdId, studentId);
      onHoldDismissed();
      onHoldUpdated();
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !hold) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 animate-pulse flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-3"></div>
        <span className="text-sm text-slate-500">Checking active application...</span>
      </div>
    );
  }

  if (!hold) return null;

  const currentClass = classes.find((c) => c.id === hold.classId);
  const className = hold.className || currentClass?.name || `Class ID: ${hold.classId}`;

  // Check if effectively expired
  const isExpired = hold.status === 'EXPIRED' || (hold.status === 'HELD' && (remainingSeconds <= 0 || isExpiredLocal));
  const isConfirmed = hold.status === 'CONFIRMED';
  const isCancelled = hold.status === 'CANCELLED';
  const isHeld = hold.status === 'HELD' && !isExpired;

  // Format countdown string mm:ss
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div
      className={`rounded-2xl p-6 shadow-md border transition-all ${
        isConfirmed
          ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200'
          : isExpired
          ? 'bg-slate-50 border-slate-300'
          : isCancelled
          ? 'bg-rose-50 border-rose-200'
          : 'bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200'
      }`}
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Header and Details */}
        <div className="space-y-1.5">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Active Application
            </span>
            <span className="text-xs font-mono bg-white/80 px-2 py-0.5 rounded border border-slate-200 text-slate-600">
              ID: {hold.holdId}
            </span>
          </div>

          <h3 className="text-xl font-extrabold text-slate-900">{className}</h3>

          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            {isConfirmed && (
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                Admission Confirmed
              </span>
            )}

            {isHeld && (
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 font-bold text-xs border border-indigo-200">
                <Clock className="w-3.5 h-3.5 mr-1 text-indigo-600 animate-spin" />
                Seat Reserved (Held)
              </span>
            )}

            {isExpired && (
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-rose-100 text-rose-800 font-bold text-xs border border-rose-200">
                <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-600" />
                Hold Expired
              </span>
            )}

            {isCancelled && (
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-200 text-slate-700 font-bold text-xs">
                Cancelled
              </span>
            )}
          </div>
        </div>

        {/* Real-time Countdown Timer Display */}
        {isHeld && (
          <div className="bg-white/90 backdrop-blur-sm border border-indigo-200 rounded-2xl p-4 text-center min-w-[180px] shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5 flex items-center justify-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              <span>Time Left to Pay</span>
            </div>
            <div className={`text-3xl font-mono font-black ${remainingSeconds < 60 ? 'text-rose-600 animate-pulse' : 'text-indigo-600'}`}>
              {timeFormatted}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Seat auto-releases when timer hits 00:00</p>
          </div>
        )}

        {isConfirmed && (
          <div className="bg-white/90 border border-emerald-200 rounded-2xl p-4 text-center min-w-[180px] shadow-sm">
            <ShieldCheck className="w-8 h-8 text-emerald-600 mx-auto mb-1" />
            <div className="text-xs font-bold text-emerald-900">Seat Guaranteed</div>
            <div className="text-[11px] text-slate-500">Fee Payment Completed</div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {isHeld && (
            <>
              <button
                onClick={handleConfirmPayment}
                disabled={actionLoading || isExpired}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md shadow-emerald-200 hover:shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                {actionLoading ? 'Processing...' : 'Pay Admission Fee'}
              </button>

              <button
                onClick={handleCancelHold}
                disabled={actionLoading}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-sm font-semibold rounded-xl transition-colors shadow-sm disabled:opacity-40"
              >
                <XCircle className="w-4 h-4 mr-1.5" />
                Cancel
              </button>
            </>
          )}

          {(isExpired || isCancelled || isConfirmed) && (
            <button
              onClick={onHoldDismissed}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
