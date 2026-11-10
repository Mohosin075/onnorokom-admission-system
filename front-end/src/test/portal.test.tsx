import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { request, type Account } from "../services/portal";

vi.mock("../services/portal", () => ({ base: "/api", request: vi.fn() }));
const user: Account = {
  id: "isolated",
  email: "isolated@example.invalid",
  role: "Student",
  fullName: "",
  guardianName: "",
  phone: "",
  address: "",
};
beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState({}, "", "/");
  vi.mocked(request).mockImplementation(async (path) => {
    if (path === "/portal") return { institutionName: null };
    if (path === "/auth/me") throw new Error("Unauthorized");
    return [];
  });
});
afterEach(() => {
  vi.useRealTimers();
});
describe("authenticated admission portal", () => {
  it("requires sign in and does not expose the former student ID identity switch", async () => {
    render(<App />);
    expect(
      await screen.findByRole("button", { name: "Sign in" }),
    ).toBeVisible();
    expect(screen.queryByLabelText("Student ID:")).not.toBeInTheDocument();
    expect(screen.queryByText("Create Class (Admin)")).not.toBeInTheDocument();
  });
  it("shows server errors without pretending registration succeeded", async () => {
    vi.mocked(request).mockImplementation(async (path) => {
      if (path === "/auth/me") throw new Error("Unauthorized");
      if (path === "/auth/register")
        throw new Error("Email delivery not configured");
      return {};
    });
    render(<App />);
    fireEvent.click(await screen.findByText("Create an account"));
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "isolated@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "IsolatedPassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email delivery not configured",
    );
  });
  it("renders an empty live database without inventing applicants or classes", async () => {
    vi.mocked(request).mockImplementation(async (path) =>
      path === "/auth/me" ? user : path === "/portal" ? {} : [],
    );
    render(<App />);
    expect(
      await screen.findByText("No admissions have been opened yet."),
    ).toBeVisible();
    expect(screen.getByText("Continue setup")).toBeVisible();
    expect(screen.queryByText("Classes & fees")).not.toBeInTheDocument();
  });
  it("keeps reservation disabled until required documents are approved", async () => {
    vi.mocked(request).mockImplementation(async (path) => {
      if (path === "/auth/me")
        return { ...user, birthRegistration: "20260000000000001" };
      if (path === "/classes")
        return [
          {
            id: "c",
            name: "Isolated class",
            totalSeats: 1,
            availableSeats: 1,
            heldSeats: 0,
            confirmedSeats: 0,
          },
        ];
      if (path === "/class-fees") return [{ classId: "c", amount: 500 }];
      if (path === "/portal") return {};
      return [];
    });
    render(<App />);
    expect(
      await screen.findByRole("button", { name: "Reserve a seat" }),
    ).toBeDisabled();
  });
  it("exposes management navigation only for an admin account", async () => {
    vi.mocked(request).mockImplementation(async (path) => {
      if (path === "/auth/me") return { ...user, role: "Admin" };
      if (path === "/admin/overview")
        return {
          students: 0,
          applications: 0,
          confirmed: 0,
          activeHolds: 0,
          revenue: 0,
          pendingDocuments: 0,
          failedNotifications: 0,
          refundRequired: 0,
          integrations: { stripe: false, email: false, sms: false },
        };
      if (path === "/portal") return {};
      return [];
    });
    render(<App />);
    expect(
      await screen.findByRole("button", { name: "Document review" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByText("Service connections")).toBeVisible(),
    );
    expect(screen.getAllByText("Not configured")).toHaveLength(3);
  });
  it("verification requires an explicit action and passes the one-time token to the API", async () => {
    window.history.replaceState({}, "", "/?action=verify&token=isolated-token");
    vi.mocked(request).mockImplementation(async (path) => {
      if (path === "/auth/me") throw new Error("Unauthorized");
      return path === "/auth/verify" ? { message: "Email verified." } : {};
    });
    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Verify email" }),
    );
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("/auth/verify", "POST", {
        token: "isolated-token",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Email verified.",
    );
  });
});
