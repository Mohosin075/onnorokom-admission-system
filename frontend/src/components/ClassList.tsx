import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { ClassItem, HoldItem } from "../types";
import { useStudent } from "../context/student-store";
import { api, getErrorMessage } from "../services/api";
interface ClassListProps {
  management?: boolean;
  applications?: HoldItem[];
  onSelectHold?: (holdId: string) => void;
  connected?: boolean;
  classes: ClassItem[];
  loading: boolean;
  onHoldCreated: (holdId: string) => void;
  onError: (msg: string) => void;
}
export function ClassList({
  management = false,
  applications = [],
  onSelectHold,
  connected = true,
  classes,
  loading,
  onHoldCreated,
  onError,
}: ClassListProps) {
  const { studentId, isValidStudentId } = useStudent();
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [availability, setAvailability] = useState("all");
  const [sort, setSort] = useState("name");
  const [now, setNow] = useState(Date.now);
  const mounted = useRef(false);
  const submitting = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      clearInterval(clock);
    };
  }, []);
  const handleApply = async (item: ClassItem) => {
    if (submitting.current || !isValidStudentId || item.availableSeats <= 0)
      return;
    submitting.current = true;
    setHoldingId(item.id);
    try {
      const response = await api.createHold(item.id, studentId);
      if (mounted.current) onHoldCreated(response.holdId);
    } catch (error) {
      if (mounted.current) onError(getErrorMessage(error));
    } finally {
      submitting.current = false;
      if (mounted.current) setHoldingId(null);
    }
  };
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
            {management ? "CLASS LIST" : "ADMISSION"}
          </span>
          <h2>{management ? "Classes and seats" : "Choose a class"}</h2>
          <p>
            {management
              ? "See seats left, students waiting for payment and completed admissions."
              : "Select Apply Now to keep a seat while you complete payment."}
          </p>
        </div>
        <span className="admission-live">
          <span
            className={
              connected ? "admission-live-dot" : "admission-offline-dot"
            }
          />{" "}
          {connected ? "Live updates" : "Reconnecting"}
        </span>
      </div>
      <div className="admission-filters">
        <div className="admission-search">
          <Search size={18} />
          <input
            aria-label="Search classes"
            placeholder="Search by class or shift…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={16} />
            </button>
          )}
        </div>
        <details className="admission-extra-filters" open={management}>
          <summary>Filter and sort</summary>
          <div className="admission-filter-options">
            <label>
              <SlidersHorizontal size={16} />
              <select
                aria-label="Seat availability"
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
              >
                <option value="all">All classes</option>
                <option value="available">Seats available</option>
                <option value="full">Full classes</option>
              </select>
            </label>
            <label>
              <select
                aria-label="Sort classes"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="name">Name: A–Z</option>
                <option value="seats">Most seats available</option>
              </select>
            </label>
          </div>
        </details>
      </div>
      <div className="admission-result-count">
        {loading && classes.length === 0
          ? "Loading classes..."
          : visible.length +
            " of " +
            classes.length +
            (classes.length === 1 ? " class" : " classes")}
        {!management && !isValidStudentId && (
          <span>
            You can browse classes now. Enter your birth registration number to
            apply.
          </span>
        )}
      </div>
      {loading && !classes.length ? (
        <div
          className="admission-class-grid"
          aria-label="Loading classes"
          aria-busy="true"
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="admission-skeleton" />
          ))}
        </div>
      ) : classes.length === 0 ? (
        <div className="admission-empty">
          <BookOpen size={32} />
          <h3>No classes found</h3>
          <p>
            {management
              ? "Create your first class to open admissions. Set the class name, shift and total seats."
              : "Admissions have not opened yet. Published classes will appear here."}
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="admission-empty">
          <Search size={30} />
          <h3>No matching classes</h3>
          <p>Try a different class name or reset your filters.</p>
          <button className="admission-secondary" onClick={clearFilters}>
            Reset filters
          </button>
        </div>
      ) : management ? (
        <div className="admission-table-wrap">
          <table className="admission-table">
            <thead>
              <tr>
                <th>Class / shift</th>
                <th>Total</th>
                <th>Waiting for payment</th>
                <th>Admitted</th>
                <th>Available</th>
                <th>Seats taken</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    {item.name}
                    <small>
                      {item.availableSeats > 0
                        ? "Accepting applications"
                        : "Currently full"}
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
                      {Math.round(
                        ((item.heldSeats + item.confirmedSeats) /
                          item.totalSeats) *
                          100,
                      )}
                      % of seats taken
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
                      ? "Class full"
                      : item.availableSeats + " seats available"}
                  </span>
                </div>
                <span className="admission-class-number">
                  {full ? "CLASS & SHIFT" : "CLASS & SHIFT"}
                </span>
                <h3>{item.name}</h3>
                <div
                  className="admission-capacity"
                  aria-label={
                    item.availableSeats +
                    " of " +
                    item.totalSeats +
                    " seats available"
                  }
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
                    <dt>Total seats</dt>
                    <dd>{item.totalSeats}</dd>
                  </div>
                  <div>
                    <dt>Awaiting payment</dt>
                    <dd>{item.heldSeats}</dd>
                  </div>
                  <div>
                    <dt>Admitted</dt>
                    <dd>{item.confirmedSeats}</dd>
                  </div>
                </dl>
                <button
                  className="admission-apply"
                  onClick={() =>
                    existing
                      ? onSelectHold?.(existing.holdId)
                      : void handleApply(item)
                  }
                  disabled={
                    (!existing && full) ||
                    holdingId !== null ||
                    !isValidStudentId
                  }
                >
                  {holdingId === item.id
                    ? "Reserving your seat…"
                    : existing
                      ? existing.status === "CONFIRMED"
                        ? "View admission"
                        : "Continue payment"
                      : full
                        ? "Class full"
                        : "Apply Now"}
                  {(!full || existing) && <ArrowRight size={17} />}
                </button>
                <small className="admission-card-note">
                  {existing
                    ? existing.status === "CONFIRMED"
                      ? "Your admission to this class is confirmed."
                      : "Your seat is waiting. Pay before the deadline."
                    : full
                      ? "A seat may become available if another student cancels."
                      : !isValidStudentId
                        ? "Enter your birth registration number above to apply."
                        : "You will see your payment deadline after applying."}
                </small>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
