import { useLanguage } from "../context/language-store";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { ClassItem, HoldItem } from "../types";
interface ClassListProps {
  management?: boolean;
  applications?: HoldItem[];
  onSelectHold?: (holdId: string) => void;
  connected?: boolean;
  classes: ClassItem[];
  loading: boolean;
  onStartEnrollment: (item: ClassItem) => void;
}
export function ClassList({
  management = false,
  applications = [],
  onSelectHold,
  connected = true,
  classes,
  loading,
  onStartEnrollment,
}: ClassListProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [availability, setAvailability] = useState("all");
  const [sort, setSort] = useState("name");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(clock);
    };
  }, []);
  const visible = classes
    .filter(
      (item) =>
        item.name.toLowerCase().includes(query.trim().toLowerCase()) &&
        (availability === "all" ||
          (availability === "available"
            ? item.availableSeats > 0
            : item.availableSeats <= 0)),
    )
    .sort((a, b) =>
      sort === "seats"
        ? b.availableSeats - a.availableSeats || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
  const clearFilters = () => {
    setQuery("");
    setAvailability("all");
    setSort("name");
  };
  return (
    <div className="admission-catalog">
      <div className="admission-section-heading">
        <div>
          <span className="admission-eyebrow">
            {management ? t("CLASS LIST") : t("ADMISSION")}
          </span>
          <h2>{management ? t("Classes and seats") : t("Choose a class")}</h2>
          <p>
            {management
              ? t(
                  "See seats left, students waiting for payment and completed admissions.",
                )
              : t(
                  "Choose a class to start. You will review your details before reserving a seat.",
                )}
          </p>
        </div>
        <span className="admission-live">
          <span
            className={
              connected ? "admission-live-dot" : "admission-offline-dot"
            }
          />{" "}
          {connected ? t("Live updates") : t("Reconnecting")}
        </span>
      </div>
      <div className="admission-filters">
        <div className="admission-search">
          <Search size={18} />
          <input
            aria-label={t("Search classes")}
            placeholder={t("Search by class or shift…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button aria-label={t("Clear search")} onClick={() => setQuery("")}>
              <X size={16} />
            </button>
          )}
        </div>
        <details className="admission-extra-filters" open={management}>
          <summary>{t("Filter and sort")}</summary>
          <div className="admission-filter-options">
            <label>
              <SlidersHorizontal size={16} />
              <select
                aria-label={t("Seat availability")}
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
              >
                <option value="all">{t("All classes")}</option>
                <option value="available">{t("Seats available")}</option>
                <option value="full">{t("Full classes")}</option>
              </select>
            </label>
            <label>
              <select
                aria-label={t("Sort classes")}
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="name">{t("Name: A–Z")}</option>
                <option value="seats">{t("Most seats available")}</option>
              </select>
            </label>
          </div>
        </details>
      </div>
      <div className="admission-result-count">
        {loading && classes.length === 0
          ? t("Loading classes...")
          : t("{visible} of {total} classes", {
              visible: visible.length,
              total: classes.length,
            })}
        {!management && !onSelectHold && (
          <span>
            {t("Choose a class. Enter the student's number in the next step.")}
          </span>
        )}
      </div>
      {loading && !classes.length ? (
        <div
          className="admission-class-grid"
          aria-label={t("Loading classes")}
          aria-busy="true"
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="admission-skeleton" />
          ))}
        </div>
      ) : !connected && classes.length === 0 ? (
        <div className="admission-empty">
          <h3>{t("Classes could not be loaded")}</h3>
          <p>
            {t(
              "We cannot check available classes right now. Use Try again above to reconnect.",
            )}
          </p>
        </div>
      ) : classes.length === 0 ? (
        <div className="admission-empty">
          <BookOpen size={32} />
          <h3>{t("No classes found")}</h3>
          <p>
            {management
              ? t(
                  "Create your first class to open admissions. Set the class name, shift and total seats.",
                )
              : t(
                  "Admissions have not opened yet. Published classes will appear here.",
                )}
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="admission-empty">
          <Search size={30} />
          <h3>{t("No matching classes")}</h3>
          <p>{t("Try a different class name or reset your filters.")}</p>
          <button className="admission-secondary" onClick={clearFilters}>
            {t("Reset filters")}
          </button>
        </div>
      ) : management ? (
        <div className="admission-table-wrap">
          <table className="admission-table">
            <thead>
              <tr>
                <th>{t("Class / shift")}</th>
                <th>{t("Total")}</th>
                <th>{t("Waiting for payment")}</th>
                <th>{t("Admitted")}</th>
                <th>{t("Available")}</th>
                <th>{t("Seats taken")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    {item.name}
                    <small>
                      {item.availableSeats > 0
                        ? t("Accepting applications")
                        : t("Currently full")}
                    </small>
                  </th>
                  <td>{item.totalSeats}</td>
                  <td>{item.heldSeats}</td>
                  <td>{item.confirmedSeats}</td>
                  <td>
                    <strong
                      className={
                        item.availableSeats > 0
                          ? "admission-text-green"
                          : "admission-text-muted"
                      }
                    >
                      {item.availableSeats}
                    </strong>
                  </td>
                  <td>
                    <div className="admission-capacity">
                      <span
                        style={{
                          width:
                            Math.min(
                              100,
                              ((item.heldSeats + item.confirmedSeats) /
                                item.totalSeats) *
                                100,
                            ) + "%",
                        }}
                      />
                    </div>
                    <small>
                      {t("{count}% of seats taken", {
                        count: Math.round(
                          ((item.heldSeats + item.confirmedSeats) /
                            item.totalSeats) *
                            100,
                        ),
                      })}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="admission-class-grid">
          {visible.map((item) => {
            const full = item.availableSeats <= 0;
            const existing = onSelectHold
              ? applications.find(
                  (hold) =>
                    hold.classId === item.id &&
                    (hold.status === "CONFIRMED" ||
                      (hold.status === "HELD" &&
                        new Date(hold.expiresAt).getTime() > now)),
                )
              : undefined;
            return (
              <article className="admission-class-card" key={item.id}>
                <div className="admission-card-top">
                  <span className="admission-class-icon">
                    <BookOpen size={21} />
                  </span>
                  <span
                    className={
                      full
                        ? "admission-seat-label is-full"
                        : "admission-seat-label"
                    }
                  >
                    {full
                      ? t("Class full")
                      : t("{count} seats available", {
                          count: item.availableSeats,
                        })}
                  </span>
                </div>
                <span className="admission-class-number">
                  {full ? t("CLASS & SHIFT") : t("CLASS & SHIFT")}
                </span>
                <h3>{item.name}</h3>
                <div
                  className="admission-capacity"
                  aria-label={t("{available} of {total} seats available", {
                    available: item.availableSeats,
                    total: item.totalSeats,
                  })}
                >
                  <span
                    style={{
                      width:
                        Math.min(
                          100,
                          ((item.heldSeats + item.confirmedSeats) /
                            item.totalSeats) *
                            100,
                        ) + "%",
                    }}
                  />
                </div>
                <dl className="admission-seat-breakdown">
                  <div>
                    <dt>{t("Total seats")}</dt>
                    <dd>{item.totalSeats}</dd>
                  </div>
                  <div>
                    <dt>{t("Awaiting payment")}</dt>
                    <dd>{item.heldSeats}</dd>
                  </div>
                  <div>
                    <dt>{t("Admitted")}</dt>
                    <dd>{item.confirmedSeats}</dd>
                  </div>
                </dl>
                <button
                  className="admission-apply"
                  onClick={() =>
                    existing
                      ? onSelectHold?.(existing.holdId)
                      : onStartEnrollment(item)
                  }
                  disabled={!existing && full}
                >
                  {existing
                    ? existing.status === "CONFIRMED"
                      ? t("View admission")
                      : t("Continue payment")
                    : full
                      ? t("Class full")
                      : t("Apply Now")}
                  {(!full || existing) && <ArrowRight size={17} />}
                </button>
                <small className="admission-card-note">
                  {existing
                    ? existing.status === "CONFIRMED"
                      ? t("Your admission to this class is confirmed.")
                      : t("Your seat is waiting. Pay before the deadline.")
                    : full
                      ? t(
                          "A seat may become available if another student cancels.",
                        )
                      : !onSelectHold
                        ? t(
                            "Your student details come next. No seat is reserved until you confirm.",
                          )
                        : t(
                            "Review your details first, then reserve a seat and pay.",
                          )}
                </small>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
