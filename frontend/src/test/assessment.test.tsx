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
    getClassById: vi.fn(),
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

async function proceedIdentity(name = "Continue to review") {
  const input = document.getElementById(
    "header-student-id",
  ) as HTMLInputElement | null;
  if (input && !input.value)
    fireEvent.change(input, { target: { value: STUDENT_A } });
  const button = screen.getByRole("button", { name });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getClassById).mockImplementation(async (id) => ({
    id, name: "Class 6 - Morning", totalSeats: 5,
    heldSeats: 0, confirmedSeats: 0, availableSeats: 5,
  }));
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
    fireEvent.click(await screen.findByRole("button", { name: "Apply Now" }));
    expect(
      screen.getByRole("button", { name: "Continue to review" }),
    ).toBeDisabled();
    const number = screen.getByLabelText("Birth registration number");
    fireEvent.change(number, {
      target: {
        value: [...STUDENT_A]
          .map((digit) => String.fromCharCode(0x09e6 + Number(digit)))
          .join(""),
      },
    });
    expect(number).toHaveValue(STUDENT_A);
    await proceedIdentity("Continue to review");
    expect(screen.getByText("Check your details")).toBeVisible();
    expect(api.createHold).not.toHaveBeenCalled();
  });

  it("separates admin actions from student admissions and preserves identity when switching", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "My applications" }));
    fireEvent.change(screen.getByLabelText("Birth registration number"), {
      target: { value: STUDENT_A },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Browse classes" }));
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
    fireEvent.click(screen.getByRole("tab", { name: "My applications" }));
    expect(screen.getByLabelText("Birth registration number")).toHaveValue(
      STUDENT_A,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Browse classes" }));
    expect(
      await screen.findByRole("button", { name: /Apply Now/i }),
    ).toBeEnabled();
  });
  it("opens the no-login assessment UI from the default application entry point", async () => {
    vi.stubEnv("VITE_APP_MODE", "assessment");
    render(<DefaultApp />);
    expect(
      within(screen.getByRole("banner")).queryByRole("textbox"),
    ).toHaveValue("");
    expect(
      screen.queryByLabelText("Birth registration number"),
    ).toBeVisible();
    expect(
      await screen.findByRole("button", { name: /Apply Now/i }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Sign in" }),
    ).not.toBeInTheDocument();
  });
  it("requires an explicit student ID on a fresh browser", async () => {
    render(<App />);
    expect(
      screen.queryByLabelText("Birth registration number"),
    ).toHaveValue("");
    fireEvent.click(await screen.findByRole("button", { name: "Apply Now" }));
    expect(
      within(
        screen.getByRole("banner"),
      ).getByLabelText("Birth registration number"),
    ).toHaveValue("");
    expect(
      within(screen.getByRole("banner")).queryByRole("textbox"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Continue to review" }),
    ).toBeDisabled();
    expect(api.createHold).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole("tab", { name: "My applications" }));
    fireEvent.change(screen.getByLabelText("Birth registration number"), {
      target: { value: STUDENT_B },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Browse classes" }));
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

describe("identity-aware enrollment", () => {
  it("finds confirmed admission at number entry and offers details or a different class", async () => {
    const confirmed = {
      ...hold("h_already_admitted"),
      status: "CONFIRMED" as const,
      className: "Class 6 - Morning",
    };
    vi.mocked(api.getMyHolds).mockResolvedValue([confirmed]);
    vi.mocked(api.getClasses).mockResolvedValue([
      {
        id: "c_test",
        name: "Class 6 - Morning",
        totalSeats: 5,
        heldSeats: 0,
        confirmedSeats: 1,
        availableSeats: 4,
      },
      {
        id: "c_other",
        name: "Class 7 - Day",
        totalSeats: 2,
        heldSeats: 0,
        confirmedSeats: 0,
        availableSeats: 2,
      },
    ]);
    render(<App />);
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Apply Now" }))[0],
    );
    fireEvent.change(screen.getByLabelText("Birth registration number"), {
      target: { value: STUDENT_A },
    });
    expect(
      await screen.findByText("You are already admitted to this class."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Continue to review" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View admission" }));
    const modal = screen.getByRole("dialog", { name: "Admission details" });
    expect(within(modal).getByText("h_already_admitted")).toBeVisible();
    fireEvent.click(within(modal).getByRole("button", { name: "Done" }));
    expect(api.createHold).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Choose another class" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply Now" }));
    expect(
      screen.getByRole("group", { name: "Review and reserve" }),
    ).toHaveTextContent("Class 7 - Day");
    await waitFor(() => expect(
      screen.getByRole("button", { name: "Reserve seat and continue" }),
    ).toBeEnabled());
    expect(api.createHold).not.toHaveBeenCalled();
  });

  it("resumes a held seat from number entry without creating a second reservation", async () => {
    vi.mocked(api.getMyHolds).mockResolvedValue([hold("h_existing_number")]);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply Now" }));
    fireEvent.change(screen.getByLabelText("Birth registration number"), {
      target: { value: STUDENT_A },
    });
    expect(
      await screen.findByText("A seat is already reserved for you."),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Continue payment" }));
    const pay = await screen.findByRole("button", {
      name: "Pay Admission Fee",
    });
    expect(api.createHold).not.toHaveBeenCalled();
    fireEvent.click(pay);
    await waitFor(() =>
      expect(api.confirmHold).toHaveBeenCalledWith(
        "h_existing_number",
        STUDENT_A,
      ),
    );
  });

  it("ignores a late identity check after the registration number changes", async () => {
    let resolveOld!: (value: HoldItem[]) => void;
    const oldResponse = new Promise<HoldItem[]>((resolve) => {
      resolveOld = resolve;
    });
    vi.mocked(api.getMyHolds).mockImplementation((id) =>
      id === STUDENT_A ? oldResponse : Promise.resolve([]),
    );
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply Now" }));
    const number = screen.getByLabelText("Birth registration number");
    fireEvent.change(number, { target: { value: STUDENT_A } });
    await waitFor(() => expect(api.getMyHolds).toHaveBeenCalledWith(STUDENT_A));
    fireEvent.change(number, { target: { value: STUDENT_B } });
    await proceedIdentity();
    await act(async () =>
      resolveOld([{ ...hold("h_old_identity"), status: "CONFIRMED" }]),
    );
    expect(
      screen.queryByText("You are already admitted to this class."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Review and reserve" }),
    ).toHaveTextContent(STUDENT_B);
    expect(
      screen.getByRole("button", { name: "Reserve seat and continue" }),
    ).toBeEnabled();
    expect(api.createHold).not.toHaveBeenCalled();
  });

  it("requires a successful identity lookup and allows retrying a failed check", async () => {
    vi.mocked(api.getMyHolds).mockRejectedValue(
      new Error("Network unavailable"),
    );
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply Now" }));
    fireEvent.change(screen.getByLabelText("Birth registration number"), {
      target: { value: STUDENT_A },
    });
    const wizard = screen.getByRole("region", { name: "Enrollment form" });
    expect(
      await within(wizard).findByText(
        "We could not check previous applications. Try again before continuing.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Continue to review" }),
    ).toBeDisabled();
    vi.mocked(api.getMyHolds).mockResolvedValue([]);
    fireEvent.click(within(wizard).getByRole("button", { name: "Try again" }));
    await proceedIdentity();
    expect(screen.getByText("Check your details")).toBeVisible();
    expect(api.createHold).not.toHaveBeenCalled();
  });

  it("allows another application when previous reservations are expired or cancelled", async () => {
    vi.mocked(api.getMyHolds).mockResolvedValue([
      hold("h_expired_number", new Date(Date.now() - 1000).toISOString()),
      { ...hold("h_cancelled_number"), status: "CANCELLED" },
    ]);
    vi.mocked(api.createHold).mockResolvedValue(hold("h_reapply_number"));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply Now" }));
    fireEvent.change(screen.getByLabelText("Birth registration number"), {
      target: { value: STUDENT_A },
    });
    await proceedIdentity();
    fireEvent.click(
      screen.getByRole("button", { name: "Reserve seat and continue" }),
    );
    expect(
      await screen.findByRole("button", { name: "Pay Admission Fee" }),
    ).toBeEnabled();
    expect(api.createHold).toHaveBeenCalledTimes(1);
  });

  it("turns a concurrent duplicate conflict into an existing-admission action", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply Now" }));
    fireEvent.change(screen.getByLabelText("Birth registration number"), {
      target: { value: STUDENT_A },
    });
    await proceedIdentity();
    vi.mocked(api.createHold).mockRejectedValue({
      isAxiosError: true,
      response: { status: 409 },
    });
    vi.mocked(api.getMyHolds).mockResolvedValue([
      { ...hold("h_other_browser"), status: "CONFIRMED" },
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: "Reserve seat and continue" }),
    );
    expect(
      await screen.findByText("You are already admitted to this class."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Reserve seat and continue" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View admission" }));
    expect(
      within(
        screen.getByRole("dialog", { name: "Admission details" }),
      ).getByText("h_other_browser"),
    ).toBeVisible();
    expect(api.createHold).toHaveBeenCalledTimes(1);
    expect(api.confirmHold).not.toHaveBeenCalled();
  });
});

describe("enrollment wizard and tabs", () => {
  it("still confirms a held seat if refreshing class details fails", async () => {
    localStorage.setItem("school_admission_student_id", STUDENT_A);
    localStorage.setItem("school_admission_active_hold_id", "h_saved");
    vi.mocked(api.getClassById).mockRejectedValue(new Error("Class details offline"));
    render(<App />);
    expect(await screen.findByText("Class details offline")).toBeVisible();
    const pay = await screen.findByRole("button", { name: "Pay Admission Fee" });
    await waitFor(() => expect(pay).toBeEnabled());
    fireEvent.click(pay);
    await screen.findByText("Admission Confirmed");
    expect(api.getClassById).toHaveBeenCalledWith("c_test");
    expect(api.confirmHold).toHaveBeenCalledWith("h_saved", STUDENT_A);
    expect(api.createHold).not.toHaveBeenCalled();
  });
  it("uses the selected-class endpoint instead of stale catalog seat counts", async () => {
    vi.mocked(api.getClassById).mockResolvedValue({
      id: "c_test", name: "Class 6 - Updated", totalSeats: 5,
      heldSeats: 3, confirmedSeats: 2, availableSeats: 0,
    });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply Now" }));
    await proceedIdentity();
    await waitFor(() => expect(api.getClassById).toHaveBeenCalledWith("c_test"));
    const review = screen.getByRole("group", { name: "Review and reserve" });
    expect(review).toHaveTextContent("Class 6 - Updated");
    expect(within(review).getByText("0")).toBeVisible();
    expect(screen.getByRole("button", { name: "Reserve seat and continue" })).toBeDisabled();
    expect(api.createHold).not.toHaveBeenCalled();
  });

  it("blocks reservation on a class-detail failure and recovers through retry", async () => {
    vi.mocked(api.getClassById).mockRejectedValueOnce(new Error("Class unavailable"));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply Now" }));
    await proceedIdentity();
    expect(await screen.findByText("Class unavailable")).toBeVisible();
    const reserve = screen.getByRole("button", { name: "Reserve seat and continue" });
    expect(reserve).toBeDisabled();
    expect(api.createHold).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(reserve).toBeEnabled());
    expect(screen.queryByText("Class unavailable")).not.toBeInTheDocument();
    expect(api.getClassById).toHaveBeenCalledTimes(2);
    expect(api.createHold).not.toHaveBeenCalled();
  });
  it("keeps the header number when applying and still requires review before reserving", async () => {
    render(<App />);
    const number = within(screen.getByRole("banner")).getByLabelText("Birth registration number");
    fireEvent.change(number, { target: { value: STUDENT_B } });
    fireEvent.click(await screen.findByRole("button", { name: "Apply Now" }));
    expect(number).toHaveValue(STUDENT_B);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    await proceedIdentity();
    expect(screen.getByRole("group", { name: "Review and reserve" })).toHaveTextContent(STUDENT_B);
    expect(api.createHold).not.toHaveBeenCalled();
  });
  it("starts a blank new student form from a saved admission and reserves for the new identity", async () => {
    localStorage.setItem("school_admission_student_id", STUDENT_A);
    localStorage.setItem("school_admission_active_hold_id", "h_previous");
    const previous = {
      ...hold("h_previous"),
      status: "CONFIRMED" as const,
      className: "Previous admission",
    };
    vi.mocked(api.getMyHolds).mockImplementation(async (id) =>
      id === STUDENT_A ? [previous] : [],
    );
    vi.mocked(api.getHoldById).mockImplementation(async (id) =>
      id === "h_previous" ? previous : hold(id),
    );
    vi.mocked(api.createHold).mockResolvedValue(hold("h_new_student"));
    render(<App />);
    await screen.findByText("Admission Confirmed");
    fireEvent.click(screen.getByRole("tab", { name: "My applications" }));
    fireEvent.click(
      screen.getByRole("button", { name: "New student admission" }),
    );
    expect(screen.getByRole("tab", { name: "Browse classes" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const number = screen.getByLabelText("Birth registration number");
    expect(number).toHaveValue("");
    expect(number).toHaveFocus();
    expect(localStorage.getItem("school_admission_active_hold_id")).toBeNull();
    expect(api.cancelHold).not.toHaveBeenCalled();
    fireEvent.change(number, { target: { value: STUDENT_B } });
    await proceedIdentity("Choose a class");
    fireEvent.click(await screen.findByRole("button", { name: "Apply Now" }));
    expect(
      screen.getByRole("group", { name: "Review and reserve" }),
    ).toHaveTextContent(STUDENT_B);
    await waitFor(() => expect(
      screen.getByRole("button", { name: "Reserve seat and continue" }),
    ).toBeEnabled());
    fireEvent.click(
      screen.getByRole("button", { name: "Reserve seat and continue" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Pay Admission Fee" }),
    );
    await screen.findByText("Admission Confirmed");
    expect(api.createHold).toHaveBeenCalledWith("c_test", STUDENT_B);
    expect(api.confirmHold).toHaveBeenCalledWith("h_new_student", STUDENT_B);
    expect(api.cancelHold).not.toHaveBeenCalled();
  });

  it("checks late history in the identity step without jumping to payment", async () => {
    let resolveHistory!: (value: HoldItem[]) => void;
    vi.mocked(api.getMyHolds).mockReturnValue(
      new Promise((resolve) => {
        resolveHistory = resolve;
      }),
    );
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "New student admission" }),
    );
    fireEvent.change(screen.getByLabelText("Birth registration number"), {
      target: { value: STUDENT_B },
    });
    await waitFor(() => expect(api.getMyHolds).toHaveBeenCalledWith(STUDENT_B));
    expect(
      screen.getByRole("button", { name: "Choose a class" }),
    ).toBeDisabled();
    await act(async () => resolveHistory([hold("h_saved_late")]));
    expect(
      await screen.findByRole("button", { name: "Continue payment" }),
    ).toBeVisible();
    expect(
      screen.getByRole("group", { name: "Student details" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Pay Admission Fee" }),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem("school_admission_active_hold_id")).toBeNull();
    expect(api.createHold).not.toHaveBeenCalled();
  });

  it("switches real tab panels without changing the URL and supports keyboard navigation", async () => {
    const originalHash = window.location.hash;
    render(<App />);
    await screen.findByRole("button", { name: "Apply Now" });
    const browse = screen.getByRole("tab", { name: "Browse classes" });
    const applications = screen.getByRole("tab", { name: "My applications" });
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(
      screen.queryByRole("region", { name: "My Applications History" }),
    ).not.toBeInTheDocument();
    fireEvent.click(applications);
    expect(applications).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("tabpanel", { name: "My applications" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Apply Now" }),
    ).not.toBeInTheDocument();
    applications.focus();
    fireEvent.keyDown(applications, { key: "ArrowLeft" });
    expect(browse).toHaveFocus();
    expect(browse).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(browse, { key: "End" });
    expect(applications).toHaveFocus();
    fireEvent.keyDown(applications, { key: "Home" });
    expect(browse).toHaveFocus();
    expect(window.location.hash).toBe(originalHash);
    expect(
      screen.queryByRole("link", { name: "Browse classes" }),
    ).not.toBeInTheDocument();
  });

  it("preserves the review step across tabs and allows editing before reserving", async () => {
    localStorage.setItem("school_admission_student_id", STUDENT_A);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply Now" }));
    await proceedIdentity("Continue to review");
    fireEvent.click(screen.getByRole("tab", { name: "My applications" }));
    expect(
      screen.queryByRole("button", { name: "Reserve seat and continue" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Browse classes" }));
    expect(screen.getByText("Check your details")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Back to student details" }),
    );
    fireEvent.change(screen.getByLabelText("Birth registration number"), {
      target: { value: STUDENT_B },
    });
    await proceedIdentity("Continue to review");
    expect(
      screen.getByRole("group", { name: "Review and reserve" }),
    ).toHaveTextContent(STUDENT_B);
    expect(api.createHold).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to classes" }));
    expect(
      await screen.findByRole("button", { name: "Apply Now" }),
    ).toBeVisible();
    expect(api.createHold).not.toHaveBeenCalled();
  });

  it("keeps review details after a reservation conflict and retries without skipping payment", async () => {
    localStorage.setItem("school_admission_student_id", STUDENT_A);
    vi.mocked(api.createHold)
      .mockRejectedValueOnce(
        new Error("No available seats left in this class."),
      )
      .mockResolvedValue(hold("h_retry"));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply Now" }));
    await proceedIdentity("Continue to review");
    fireEvent.click(
      screen.getByRole("button", { name: "Reserve seat and continue" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No available seats",
    );
    expect(
      screen.getByRole("group", { name: "Review and reserve" }),
    ).toHaveTextContent(STUDENT_A);
    expect(api.confirmHold).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Reserve seat and continue" }),
    );
    expect(
      await screen.findByRole("button", { name: "Pay Admission Fee" }),
    ).toBeEnabled();
    expect(api.createHold).toHaveBeenCalledTimes(2);
    expect(api.confirmHold).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "My applications" }));
    fireEvent.click(screen.getByRole("tab", { name: "Browse classes" }));
    expect(
      screen.getByRole("button", { name: "Pay Admission Fee" }),
    ).toBeEnabled();
    expect(api.createHold).toHaveBeenCalledTimes(2);
  });
});

describe("application status and errors", () => {
  it("keeps previously loaded applications visible when a refresh fails", async () => {
    localStorage.setItem("school_admission_student_id", STUDENT_A);
    vi.mocked(api.getMyHolds).mockResolvedValue([
      { ...hold("h_saved"), className: "Saved application" },
    ]);
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "My applications" }));
    const history = screen.getByRole("region", {
      name: "My Applications History",
    });
    expect(await within(history).findByText("Saved application")).toBeVisible();
    vi.mocked(api.getMyHolds).mockRejectedValue(
      new Error("Connection unavailable"),
    );
    fireEvent.click(
      within(history).getByRole("button", { name: "Refresh Applications" }),
    );
    expect(await within(history).findByRole("alert")).toHaveTextContent(
      "Your saved list may be out of date.",
    );
    expect(within(history).getByText("Saved application")).toBeVisible();
    expect(
      within(history).queryByText("You have not applied yet."),
    ).not.toBeInTheDocument();
  });

  it("shows a retryable history error instead of claiming no application exists, then recovers", async () => {
    localStorage.setItem("school_admission_student_id", STUDENT_A);
    vi.mocked(api.getMyHolds).mockRejectedValue(
      new Error("Connection unavailable"),
    );
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "My applications" }));
    const history = screen.getByRole("region", {
      name: "My Applications History",
    });
    expect(
      await within(history).findByText("Applications could not be loaded"),
    ).toBeVisible();
    expect(
      within(history).queryByText("You have not applied yet."),
    ).not.toBeInTheDocument();
    vi.mocked(api.getMyHolds).mockResolvedValue([]);
    fireEvent.click(within(history).getByRole("button", { name: "Try again" }));
    expect(
      await within(history).findByText("You have not applied yet."),
    ).toBeVisible();
    expect(within(history).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not describe a class request failure as admissions being closed", async () => {
    vi.mocked(api.getClasses).mockRejectedValue(
      new Error("Connection unavailable"),
    );
    render(<App />);
    expect(
      await screen.findByText("Classes could not be loaded"),
    ).toBeVisible();
    expect(
      screen.queryByText(
        "Admissions have not opened yet. Published classes will appear here.",
      ),
    ).not.toBeInTheDocument();
    vi.mocked(api.getClasses).mockResolvedValue([
      {
        id: "c_retry",
        name: "Recovered class",
        totalSeats: 2,
        heldSeats: 0,
        confirmedSeats: 0,
        availableSeats: 2,
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Recovered class")).toBeVisible();
  });

  it("supports the Bangla admission flow and remembers language without changing student identity", async () => {
    localStorage.setItem("school_admission_student_id", STUDENT_A);
    vi.mocked(api.createHold).mockResolvedValue(hold("h_bangla"));
    const view = render(<App />);
    fireEvent.change(screen.getByLabelText("Language / ভাষা"), {
      target: { value: "bn" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "আবেদন করুন" }));
    expect(screen.getByLabelText("জন্ম নিবন্ধন নম্বর")).toHaveValue(STUDENT_A);
    fireEvent.change(screen.getByLabelText("জন্ম নিবন্ধন নম্বর"), {
      target: { value: STUDENT_A },
    });
    await proceedIdentity("তথ্য যাচাইয়ের ধাপে যান");
    fireEvent.click(
      screen.getByRole("button", { name: "আসন রেখে পরের ধাপে যান" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "ভর্তি ফি দিন" }),
    );
    expect(await screen.findByText("ভর্তি নিশ্চিত হয়েছে")).toBeVisible();
    expect(api.confirmHold).toHaveBeenCalledWith("h_bangla", STUDENT_A);
    view.unmount();
    render(<App />);
    expect(screen.getByLabelText("Language / ভাষা")).toHaveValue("bn");
    fireEvent.click(screen.getByRole("tab", { name: "আমার আবেদন" }));
    expect(screen.getByLabelText("জন্ম নিবন্ধন নম্বর")).toHaveValue(STUDENT_A);
  });

  it("updates the current application step through reservation and payment", async () => {
    vi.mocked(api.createHold).mockResolvedValue(hold("h_steps"));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply Now" }));
    const steps = screen.getByRole("list", { name: "Enrollment steps" });
    expect(within(steps).getAllByRole("listitem")[0]).toHaveAttribute(
      "aria-current",
      "step",
    );
    fireEvent.change(screen.getByLabelText("Birth registration number"), {
      target: { value: STUDENT_A },
    });
    await proceedIdentity("Continue to review");
    expect(within(steps).getAllByRole("listitem")[1]).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(api.createHold).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Reserve seat and continue" }),
    );
    const pay = await screen.findByRole("button", {
      name: "Pay Admission Fee",
    });
    expect(within(steps).getAllByRole("listitem")[2]).toHaveAttribute(
      "aria-current",
      "step",
    );
    fireEvent.click(pay);
    await screen.findByText("Admission Confirmed");
    expect(steps.querySelector('[aria-current="step"]')).toBeNull();
    expect(within(steps).getAllByText("Completed")).toHaveLength(4);
    expect(api.createHold).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "See my applications" }),
    );
    expect(
      screen.getByRole("tab", { name: "My applications" }),
    ).toHaveAttribute("aria-selected", "true");
  });

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
    await screen.findByText("ID: h_existing");
    fireEvent.click(screen.getByRole("button", { name: "Back to classes" }));
    expect(
      within(
        screen.getByRole("region", { name: "Class and Shifts List" }),
      ).getByRole("button", { name: "Class full" }),
    ).toBeDisabled();
    const resume = screen.getByRole("button", {
      name: "View your application",
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
    await proceedIdentity("Continue to review");
    fireEvent.click(
      screen.getByRole("button", { name: "Reserve seat and continue" }),
    );
    await screen.findByText("ID: h_focus");
    expect(screen.getByRole("group", { name: "Pay to confirm" })).toHaveFocus();
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

  it("filters history and shows confirmed admission details in a modal without changing tabs", async () => {
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
    fireEvent.click(screen.getByRole("tab", { name: "My applications" }));
    const filter = await screen.findByLabelText("Show applications");
    fireEvent.change(filter, { target: { value: "EXPIRED" } });
    expect(screen.getByText("Expired class")).toBeVisible();
    expect(screen.queryByText("Confirmed class")).not.toBeInTheDocument();
    fireEvent.change(filter, { target: { value: "CONFIRMED" } });
    expect(screen.queryByText("Expired class")).not.toBeInTheDocument();
    const detailsButton = within(
      screen.getByRole("region", { name: "My Applications History" }),
    ).getByRole("button", { name: "View admission" });
    detailsButton.focus();
    fireEvent.click(detailsButton);
    const modal = await screen.findByRole("dialog", {
      name: "Admission details",
    });
    expect(within(modal).getByText("Admission Confirmed")).toBeVisible();
    expect(within(modal).getByText("Confirmed class")).toBeVisible();
    expect(within(modal).getByText(STUDENT_A)).toBeVisible();
    expect(within(modal).getByText("h_confirmed")).toBeVisible();
    expect(
      screen.getByRole("tab", { name: "My applications" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      within(modal).getByRole("button", { name: "Close admission details" }),
    ).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: /Pay Admission Fee/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(modal).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(detailsButton).toHaveFocus();
    fireEvent.click(detailsButton);
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { cancelable: true }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(detailsButton).toHaveFocus();
    expect(api.confirmHold).not.toHaveBeenCalled();
  });

  it("keeps public class cards open to new students after another student has confirmed admission", async () => {
    localStorage.setItem("school_admission_student_id", STUDENT_A);
    vi.mocked(api.getMyHolds).mockResolvedValue([
      {
        ...hold("h_catalog"),
        status: "CONFIRMED",
        className: "Class 6 - Morning",
      },
    ]);
    render(<App />);
    const catalog = screen.getByRole("region", {
      name: "Class and Shifts List",
    });
    await waitFor(() => expect(api.getMyHolds).toHaveBeenCalledWith(STUDENT_A));
    expect(
      within(catalog).queryByRole("button", { name: "View admission" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      await within(catalog).findByRole("button", { name: "Apply Now" }),
    );
    const number = screen.getByLabelText("Birth registration number");
    expect(number).toHaveValue(STUDENT_A);
    expect(localStorage.getItem("school_admission_student_id")).toBe(STUDENT_A);
    expect(api.createHold).not.toHaveBeenCalled();
    fireEvent.change(number, { target: { value: STUDENT_A } });
    fireEvent.click(
      await screen.findByRole("button", { name: "View admission" }),
    );
    const modal = screen.getByRole("dialog", { name: "Admission details" });
    expect(within(modal).getByText("h_catalog")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Browse classes" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(api.createHold).not.toHaveBeenCalled();
    fireEvent.click(modal);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to classes" }));
    expect(screen.getByRole("button", { name: "Apply Now" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "View admission" }),
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
    fireEvent.click(
      screen.getByRole("button", { name: "Choose a class again" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /Apply Now/i }));
    await proceedIdentity("Continue to review");
    fireEvent.click(
      screen.getByRole("button", { name: "Reserve seat and continue" }),
    );
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
    expect(await within(screen.getByRole("region", { name: "Enrollment form" }))
      .findByText("EXPIRED · Payment deadline passed")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "My applications" }));
    expect(
      await within(
        within(
          screen.getByRole("region", { name: "My Applications History" }),
        ).getByRole("table"),
      ).findByText("EXPIRED · Payment deadline passed", {}, { timeout: 2000 }),
    ).toBeInTheDocument();
  });

  it("keeps EXPIRED visible in Bangla status badges and the history filter", async () => {
    localStorage.setItem("school_admission_language", "bn");
    localStorage.setItem("school_admission_student_id", STUDENT_A);
    localStorage.setItem("school_admission_active_hold_id", "h_expired_bn");
    const expired = { ...hold("h_expired_bn"), status: "EXPIRED" as const };
    vi.mocked(api.getHoldById).mockResolvedValue(expired);
    vi.mocked(api.getMyHolds).mockResolvedValue([expired]);
    render(<App />);
    expect(await within(screen.getByRole("region", { name: "ভর্তির আবেদন ফরম" }))
      .findByText("EXPIRED · ফি দেওয়ার সময় শেষ")).toBeVisible();
    expect(screen.getByRole("button", { name: "আসন সংরক্ষণের সময় শেষ" })).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "আমার আবেদন" }));
    const history = screen.getByRole("region", { name: "আমার আবেদনের ইতিহাস" });
    expect(await within(history).findByText("EXPIRED · ফি দেওয়ার সময় শেষ", { selector: "span" })).toBeVisible();
    expect(screen.getByRole("option", { name: "EXPIRED · ফি দেওয়ার সময় শেষ" })).toHaveValue("EXPIRED");
    expect(api.confirmHold).not.toHaveBeenCalled();
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
