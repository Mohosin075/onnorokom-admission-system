import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../AssessmentApp";
import DefaultApp from "../App";
import { StudentProvider } from "../context/StudentContext";
import { useStudent } from "../context/student-store";
import { api } from "../services/api";
import type { ClassItem, HoldItem } from "../types";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

vi.mock("../services/api", () => ({
  api: {
    getClasses: vi.fn(),
    getMyHolds: vi.fn(),
    getHoldById: vi.fn(),
    createHold: vi.fn(),
    confirmHold: vi.fn(),
    cancelHold: vi.fn(),
    createClass: vi.fn(),
  },
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Request failed",
}));

const STUDENT_A = "20260000000000001";
const STUDENT_B = "20260000000000002";
const hold = (
  id: string,
  expiresAt = new Date(Date.now() + 600000).toISOString(),
): HoldItem => ({
  holdId: id,
  classId: "c_test",
  status: "HELD",
  expiresAt,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getClasses).mockResolvedValue([
    {
      id: "c_test",
      name: "Class 6 - Morning",
      totalSeats: 5,
      heldSeats: 0,
      confirmedSeats: 0,
      availableSeats: 5,
    },
  ]);
  vi.mocked(api.getMyHolds).mockResolvedValue([]);
  vi.mocked(api.getHoldById).mockImplementation(async (id) => hold(id));
  vi.mocked(api.confirmHold).mockResolvedValue({
    holdId: "h_b",
    status: "CONFIRMED",
  });
});

describe("student identity and restoration", () => {
  it("guides a new student to the number field and accepts Bangla digits without applying automatically", async () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Start with your birth registration number",
      }),
    );
    const number = screen.getByLabelText("Birth registration number");
    expect(number).toHaveFocus();
    const banglaNumber = [...STUDENT_A]
      .map((digit) => String.fromCharCode(0x09e6 + Number(digit)))
      .join("");
    fireEvent.change(number, { target: { value: banglaNumber } });
    expect(number).toHaveValue(STUDENT_A);
    expect(
      await screen.findByRole("button", { name: "Apply Now" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("link", { name: "Choose a class" }),
    ).toHaveAttribute("href", "#class-directory");
    expect(api.createHold).not.toHaveBeenCalled();
  });
  it("separates admin actions from student admissions and preserves identity when switching", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Birth registration number"), {
      target: { value: STUDENT_A },
    });
    await screen.findByRole("button", { name: /Apply Now/i });
    expect(
      screen.queryByRole("button", { name: /Add a class/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Admin workspace" }));
    expect(screen.getByRole("button", { name: /Add a class/i })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Apply Now/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Birth registration number"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/public assessment workspace/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Student admissions" }));
    expect(screen.getByLabelText("Birth registration number")).toHaveValue(
      STUDENT_A,
    );
    expect(
      await screen.findByRole("button", { name: /Apply Now/i }),
    ).toBeEnabled();
  });
  it("opens the no-login assessment UI from the default application entry point", async () => {
    vi.stubEnv("VITE_APP_MODE", "assessment");
    render(<DefaultApp />);
    expect(screen.getByLabelText("Birth registration number")).toBeVisible();
    expect(
      await screen.findByRole("button", { name: /Apply Now/i }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Sign in" }),
    ).not.toBeInTheDocument();
  });
  it("requires an explicit student ID on a fresh browser", async () => {
    render(<App />);
    expect(screen.getByLabelText("Birth registration number")).toHaveValue("");
    expect(
      await screen.findByRole("button", { name: /Apply Now/i }),
    ).toBeDisabled();
  });

  it("restores saved state and clears the previous hold when identity changes", () => {
    localStorage.setItem("school_admission_student_id", STUDENT_A);
    localStorage.setItem("school_admission_active_hold_id", "h_a");
    function Probe() {
      const student = useStudent();
      return (
        <>
          <output>
            {student.studentId}:{student.activeHoldId || "none"}
          </output>
          <button onClick={() => student.setStudentId(STUDENT_B)}>
            Switch
          </button>
        </>
      );
    }
    const view = render(
      <StudentProvider>
        <Probe />
      </StudentProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(`${STUDENT_A}:h_a`);
    fireEvent.click(screen.getByText("Switch"));
    expect(screen.getByRole("status")).toHaveTextContent(`${STUDENT_B}:none`);
    expect(localStorage.getItem("school_admission_active_hold_id")).toBeNull();
    view.unmount();
    render(
      <StudentProvider>
        <Probe />
      </StudentProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(`${STUDENT_B}:none`);
  });

  it("ignores a previous student response after switching identity", async () => {
    localStorage.setItem("school_admission_student_id", STUDENT_A);
    localStorage.setItem("school_admission_active_hold_id", "h_a");
    let resolveOld!: (value: HoldItem) => void;
    const oldResponse = new Promise<HoldItem>((resolve) => {
      resolveOld = resolve;
    });
    vi.mocked(api.getHoldById).mockImplementation((id) =>
      id === "h_a" ? oldResponse : Promise.resolve(hold(id)),
    );
    vi.mocked(api.getMyHolds).mockImplementation(async (id) =>
      id === STUDENT_B ? [hold("h_b")] : [],
    );
    render(<App />);
    await waitFor(() => expect(api.getHoldById).toHaveBeenCalledWith("h_a"));
    fireEvent.change(screen.getByLabelText("Birth registration number"), {
      target: { value: STUDENT_B },
    });
    await screen.findByText("ID: h_b");
    await act(async () => resolveOld(hold("h_a")));
    expect(screen.queryByText("ID: h_a")).not.toBeInTheDocument();
    const pay = await screen.findByRole("button", {
      name: /Pay Admission Fee/i,
    });
    await waitFor(() => expect(pay).toBeEnabled());
    fireEvent.click(pay);
    await waitFor(() =>
      expect(api.confirmHold).toHaveBeenCalledWith("h_b", STUDENT_B),
    );
  });
});

describe("application status and errors", () => {
  it("resumes an existing reservation even when the class has no seats left", async () => {
    localStorage.setItem("school_admission_student_id", STUDENT_A);
    const reservation = hold("h_existing");
    vi.mocked(api.getMyHolds).mockResolvedValue([reservation]);
    vi.mocked(api.getClasses).mockResolvedValue([
      {
        id: "c_test",
        name: "Reserved class",
        totalSeats: 1,
        heldSeats: 1,
        confirmedSeats: 0,
        availableSeats: 0,
      },
    ]);
    render(<App />);
    const resume = await within(
      screen.getByRole("region", { name: "Class and Shifts List" }),
    ).findByRole("button", {
      name: "Continue payment",
    });
    expect(resume).toBeEnabled();
    fireEvent.click(resume);
    expect(await screen.findByText("ID: h_existing")).toBeInTheDocument();
    expect(api.createHold).not.toHaveBeenCalled();
  });

  it("searches, filters and sorts real class responses without changing seat counts", async () => {
    const base = { totalSeats: 5, heldSeats: 0, confirmedSeats: 0 };
    vi.mocked(api.getClasses).mockResolvedValue([
      { ...base, id: "alpha", name: "Alpha Morning", availableSeats: 2 },
      { ...base, id: "beta", name: "Beta Evening", availableSeats: 5 },
      {
        ...base,
        id: "full",
        name: "Closed Morning",
        confirmedSeats: 5,
        availableSeats: 0,
      },
    ]);
    render(<App />);
    await screen.findByText("Alpha Morning");
    fireEvent.click(screen.getByText("Filter and sort"));
    fireEvent.change(screen.getByLabelText("Sort classes"), {
      target: { value: "seats" },
    });
    expect(
      screen
        .getAllByRole("article")
        .map((item) => within(item).getByRole("heading").textContent),
    ).toEqual(["Beta Evening", "Alpha Morning", "Closed Morning"]);
    fireEvent.change(screen.getByLabelText("Seat availability"), {
      target: { value: "available" },
    });
    expect(screen.queryByText("Closed Morning")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search classes"), {
      target: { value: "EVENING" },
    });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("Beta Evening")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Search classes"), {
      target: { value: "unknown" },
    });
    expect(screen.getByText("No matching classes")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(api.createHold).not.toHaveBeenCalled();
  });

  it("moves keyboard focus to the payment section after reserving a seat", async () => {
    localStorage.setItem("school_admission_student_id", STUDENT_A);
    vi.mocked(api.createHold).mockResolvedValue(hold("h_focus"));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply Now" }));
    await screen.findByText("ID: h_focus");
    expect(
      screen.getByRole("region", { name: "Active Application Status" }),
    ).toHaveFocus();
    expect(api.createHold).toHaveBeenCalledWith("c_test", STUDENT_A);
  });

  it("only releases a reservation after explicit inline confirmation", async () => {
    localStorage.setItem("school_admission_student_id", STUDENT_A);
    localStorage.setItem("school_admission_active_hold_id", "h_cancel");
    vi.mocked(api.cancelHold).mockResolvedValue(undefined);
    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: /^Cancel application$/i }),
    );
    expect(api.cancelHold).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep my seat" }));
    expect(
      screen.queryByText("Cancel this application?"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    fireEvent.click(
      screen.getByRole("button", { name: "Yes, cancel application" }),
    );
    await waitFor(() =>
      expect(api.cancelHold).toHaveBeenCalledWith("h_cancel", STUDENT_A),
    );
    await waitFor(() =>
      expect(screen.queryByText("ID: h_cancel")).not.toBeInTheDocument(),
    );
  });

  it("filters history using effective expiry and reopens a confirmed admission", async () => {
    localStorage.setItem("school_admission_student_id", STUDENT_A);
    const confirmed = {
      ...hold("h_confirmed"),
      className: "Confirmed class",
      status: "CONFIRMED" as const,
    };
    const expired = {
      ...hold("h_expired", new Date(Date.now() - 1000).toISOString()),
      className: "Expired class",
    };
    vi.mocked(api.getMyHolds).mockResolvedValue([confirmed, expired]);
    vi.mocked(api.getHoldById).mockResolvedValue(confirmed);
    render(<App />);
    const filter = await screen.findByLabelText("Show applications");
    fireEvent.change(filter, { target: { value: "EXPIRED" } });
    expect(screen.getByText("Expired class")).toBeVisible();
    expect(screen.queryByText("Confirmed class")).not.toBeInTheDocument();
    fireEvent.change(filter, { target: { value: "CONFIRMED" } });
    expect(screen.queryByText("Expired class")).not.toBeInTheDocument();
    fireEvent.click(
      within(
        screen.getByRole("region", { name: "My Applications History" }),
      ).getByRole("button", { name: "View admission" }),
    );
    expect(await screen.findByText("Admission Confirmed")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Pay Admission Fee/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a successful payment even if a subsequent status read would fail", async () => {
    localStorage.setItem("school_admission_student_id", STUDENT_A);
    localStorage.setItem("school_admission_active_hold_id", "h_paid");
    vi.mocked(api.getHoldById)
      .mockResolvedValueOnce(hold("h_paid"))
      .mockRejectedValue(new Error("Read unavailable"));
    render(<App />);
    const pay = await screen.findByRole("button", {
      name: /Pay Admission Fee/i,
    });
    fireEvent.click(pay);
    expect(await screen.findByText("Admission Confirmed")).toBeInTheDocument();
  });

  it("displays slow class responses instead of invalidating them on every poll", async () => {
    vi.useFakeTimers();
    let resolveClasses!: (value: ClassItem[]) => void;
    vi.mocked(api.getClasses).mockReturnValue(
      new Promise((resolve) => {
        resolveClasses = resolve;
      }),
    );
    render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6500);
    });
    expect(api.getClasses).toHaveBeenCalledTimes(1);
    await act(async () =>
      resolveClasses([
        {
          id: "c_slow",
          name: "Slow class",
          totalSeats: 1,
          heldSeats: 0,
          confirmedSeats: 0,
          availableSeats: 1,
        },
      ]),
    );
    expect(screen.getByText("Slow class")).toBeInTheDocument();
  });

  it("does not let a closed class submission overwrite a reopened form", async () => {
    vi.useFakeTimers();
    let resolveCreate!: (value: {
      id: string;
      name: string;
      totalSeats: number;
    }) => void;
    vi.mocked(api.createClass).mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Admin workspace" }));
    fireEvent.click(screen.getByRole("button", { name: /Add a class/i }));
    fireEvent.change(screen.getByLabelText("Class name and shift"), {
      target: { value: "Old class" },
    });
    fireEvent.change(screen.getByLabelText("Number of seats"), {
      target: { value: "120" },
    });
    fireEvent.submit(
      screen.getByLabelText("Class name and shift").closest("form")!,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: /Add a class/i }));
    fireEvent.change(screen.getByLabelText("Class name and shift"), {
      target: { value: "New class" },
    });
    await act(async () =>
      resolveCreate({ id: "c_old", name: "Old class", totalSeats: 120 }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Class name and shift")).toHaveValue(
      "New class",
    );
    expect(screen.getByRole("button", { name: "Add class" })).toBeEnabled();
  });

  it("allows payment for a new hold after the previous application expired", async () => {
    localStorage.setItem("school_admission_student_id", STUDENT_A);
    localStorage.setItem("school_admission_active_hold_id", "h_old");
    vi.mocked(api.getHoldById).mockImplementation(async (id) =>
      id === "h_old"
        ? hold(id, new Date(Date.now() - 1000).toISOString())
        : hold(id),
    );
    vi.mocked(api.createHold).mockResolvedValue(hold("h_new"));
    render(<App />);
    expect(
      await screen.findByRole("button", { name: /Expired/i }),
    ).toBeDisabled();
    fireEvent.click(await screen.findByRole("button", { name: /Apply Now/i }));
    await screen.findByText("ID: h_new");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Pay Admission Fee/i }),
      ).toBeEnabled(),
    );
  });

  it("disables payment and updates history at expiry without a reload", async () => {
    localStorage.setItem("school_admission_student_id", STUDENT_A);
    localStorage.setItem("school_admission_active_hold_id", "h_timer");
    const timedHold = hold("h_timer", new Date(Date.now() + 500).toISOString());
    vi.mocked(api.getHoldById).mockResolvedValue(timedHold);
    vi.mocked(api.getMyHolds).mockResolvedValue([timedHold]);
    render(<App />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Pay Admission Fee/i }),
      ).toBeEnabled(),
    );
    expect(
      await screen.findByRole(
        "button",
        { name: /Expired/i },
        { timeout: 2000 },
      ),
    ).toBeDisabled();
    expect(
      await within(
        within(
          screen.getByRole("region", { name: "My Applications History" }),
        ).getByRole("table"),
      ).findByText("Payment deadline passed", {}, { timeout: 2000 }),
    ).toBeInTheDocument();
  });

  it("shows a warning when background seat polling loses the server", async () => {
    vi.mocked(api.getClasses)
      .mockResolvedValueOnce([])
      .mockRejectedValue(new Error("Server unavailable"));
    render(<App />);
    await screen.findByText("No classes found");
    expect(
      await screen.findByRole("alert", {}, { timeout: 4500 }),
    ).toHaveTextContent("Seat counts may be out of date");
  });

  it("opens an accessible class dialog and restores focus on Escape", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Admin workspace" }));
    const open = screen.getByRole("button", { name: /Add a class/i });
    open.focus();
    fireEvent.click(open);
    expect(
      screen.getByRole("dialog", { name: "Add a class" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Class name and shift")).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });
});
