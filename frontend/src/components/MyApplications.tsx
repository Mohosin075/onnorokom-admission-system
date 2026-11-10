import { useLanguage } from "../context/language-store";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { HoldItem } from "../types";
import { useStudent } from "../context/student-store";
import { api, getErrorMessage } from "../services/api";
import {
  FileText,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
} from "lucide-react";

interface MyApplicationsProps {
  onSelectHold: (holdId: string) => void;
  onApplicationsLoaded?: (studentId: string, holds: HoldItem[]) => void;
  refreshTrigger: number;
  onBrowseClasses?: () => void;
}

export const MyApplications: React.FC<MyApplicationsProps> = ({
  onSelectHold,
  onApplicationsLoaded,
  refreshTrigger,
  onBrowseClasses,
}) => {
  const { t, language } = useLanguage();
  const { studentId, isValidStudentId } = useStudent();
  const [holds, setHolds] = useState<HoldItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const version = useRef(0);
  const mounted = useRef(false);
  const fetching = useRef(false);

  const fetchMyHolds = useCallback(async () => {
    if (fetching.current) return;
    const request = ++version.current;
    if (!isValidStudentId) {
      setHolds([]);
      return;
    }
    fetching.current = true;

    setLoading(true);
    try {
      const data = await api.getMyHolds(studentId);
      if (mounted.current && request === version.current) {
        setHolds(data);
        setHasLoaded(true);
        setError(null);
        onApplicationsLoaded?.(studentId, data);
      }
    } catch (err) {
      if (mounted.current && request === version.current)
        setError(getErrorMessage(err));
    } finally {
      fetching.current = false;
      if (mounted.current && request === version.current) setLoading(false);
    }
  }, [isValidStudentId, studentId, onApplicationsLoaded]);

  useEffect(() => {
    mounted.current = true;
    const initial = setTimeout(() => {
      void fetchMyHolds();
    }, 0);
    const poll = setInterval(() => {
      void fetchMyHolds();
    }, 4000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      clearTimeout(initial);
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [fetchMyHolds, refreshTrigger]);

  const getStatusBadge = (status: string, expiresAt: string) => {
    const isActuallyExpired =
      status === "EXPIRED" ||
      (status === "HELD" && new Date(expiresAt).getTime() <= now);

    if (status === "CONFIRMED") {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
          {t("Admitted")}
        </span>
      );
    }

    if (isActuallyExpired) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
          <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-600" />
          {t("Payment deadline passed")}
        </span>
      );
    }

    if (status === "CANCELLED") {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-slate-200 text-slate-700">
          <XCircle className="w-3.5 h-3.5 mr-1 text-slate-500" />
          {t("Cancelled")}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
        <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" />
        {t("Waiting for payment")}
      </span>
    );
  };

  const visibleHolds = holds.filter(
    (hold) =>
      statusFilter === "all" ||
      (hold.status === "HELD" && new Date(hold.expiresAt).getTime() <= now
        ? "EXPIRED"
        : hold.status) === statusFilter,
  );
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {t("My applications")}
            </h2>
            <p className="text-xs text-slate-500">
              {t("Birth registration number:")}{" "}
              <span className="font-mono font-medium text-slate-800">
                {studentId || t("None")}
              </span>
            </p>
          </div>
        </div>

        <button
          onClick={fetchMyHolds}
          disabled={loading || !isValidStudentId}
          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-40"
          title={t("Refresh Applications")}
        >
          <RefreshCw
            className={`w-4 h-4 ${loading ? "animate-spin text-indigo-600" : ""}`}
          />
        </button>
      </div>

      {isValidStudentId && holds.length > 0 && (
        <div className="admission-history-filter">
          <label htmlFor="application-status">{t("Show applications")}</label>
          <select
            id="application-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">{t("All applications")}</option>
            <option value="HELD">{t("Waiting for payment")}</option>
            <option value="CONFIRMED">{t("Admitted")}</option>
            <option value="EXPIRED">{t("Payment deadline passed")}</option>
            <option value="CANCELLED">{t("Cancelled")}</option>
          </select>
          <span>
            {t("{visible} of {total} applications", {
              visible: visibleHolds.length,
              total: holds.length,
            })}
          </span>
        </div>
      )}
      {error && holds.length > 0 && (
        <div role="alert" className="admission-history-error">
          <p>
            {t(error)} {t("Your saved list may be out of date.")}
          </p>
          <button onClick={() => void fetchMyHolds()} disabled={loading}>
            {loading ? t("Retrying...") : t("Try again")}
          </button>
        </div>
      )}

      {!isValidStudentId ? (
        <div className="p-8 text-center text-slate-400">
          <p className="text-sm">
            {t(
              "Enter your birth registration number above to see your applications.",
            )}
          </p>
        </div>
      ) : error && holds.length === 0 ? (
        <div role="alert" className="admission-history-error">
          <h3>{t("Applications could not be loaded")}</h3>
          <p>{t(error)}</p>
          <p>
            {t(
              "We cannot check your applications right now. Retry before applying again.",
            )}
          </p>
          <button onClick={() => void fetchMyHolds()} disabled={loading}>
            {loading ? t("Retrying...") : t("Try again")}
          </button>
        </div>
      ) : !hasLoaded ? (
        <div className="p-8 text-center text-slate-400">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs">{t("Fetching applications...")}</p>
        </div>
      ) : holds.length === 0 ? (
        <div className="p-8 text-center text-slate-400">
          <p className="text-sm font-medium mb-1">
            {t("You have not applied yet.")}
          </p>
          <p className="text-xs">
            {t(
              "Open Browse classes to choose a class and start your application.",
            )}
          </p>
          <button className="admission-secondary" onClick={onBrowseClasses}>
            {t("Browse classes")}
          </button>
        </div>
      ) : visibleHolds.length === 0 ? (
        <div className="admission-empty">
          <h3>{t("No applications with this status")}</h3>
          <button
            className="admission-secondary"
            onClick={() => setStatusFilter("all")}
          >
            {t("Show all applications")}
          </button>
        </div>
      ) : (
        <div className="admission-history-results">
          <table className="admission-history-table w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-6 py-3 font-semibold">
                  {t("Class / Shift")}
                </th>
                <th className="px-6 py-3 font-semibold">{t("Status")}</th>
                <th className="px-6 py-3 font-semibold">
                  {t("Payment deadline")}
                </th>
                <th className="px-6 py-3 font-semibold text-right">
                  {t("Action")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleHolds.map((h) => {
                const isHeld =
                  h.status === "HELD" && new Date(h.expiresAt).getTime() > now;
                return (
                  <tr
                    key={h.holdId}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <td
                      data-label={t("Class / Shift")}
                      className="px-6 py-3.5 font-semibold text-slate-800"
                    >
                      {h.className || h.classId}
                      <details className="admission-reference">
                        <summary>{t("Application reference")}</summary>
                        <span>{h.holdId}</span>
                      </details>
                    </td>
                    <td data-label={t("Status")} className="px-6 py-3.5">
                      {getStatusBadge(h.status, h.expiresAt)}
                    </td>
                    <td
                      data-label={t("Payment deadline")}
                      className="px-6 py-3.5 text-xs text-slate-500"
                    >
                      {h.status === "CONFIRMED"
                        ? t("Payment completed")
                        : h.status === "CANCELLED"
                          ? t("Seat released")
                          : new Date(h.expiresAt).toLocaleString(
                              language === "bn" ? "bn-BD" : "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                    </td>
                    <td
                      data-label={t("Action")}
                      className="px-6 py-3.5 text-right"
                    >
                      {isHeld ? (
                        <button
                          onClick={() => onSelectHold(h.holdId)}
                          className="px-3 py-1 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200"
                        >
                          {t("Continue payment")}
                        </button>
                      ) : h.status === "CONFIRMED" ? (
                        <button
                          onClick={() => onSelectHold(h.holdId)}
                          className="px-3 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg"
                        >
                          {t("View admission")}
                        </button>
                      ) : (
                        <button
                          className="text-xs font-semibold text-emerald-700 underline"
                          onClick={onBrowseClasses}
                        >
                          {t("Choose a class again")}
                        </button>
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
