import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import App from "../PortalApp";
import { request } from "../services/portal";

vi.mock("../services/portal", () => ({ base: "/api", request: vi.fn() }));
const account = {
  id: "isolated",
  email: "isolated@example.invalid",
  role: "Student",
  fullName: "Applicant name",
  birthRegistration: "20260000000000001",
  dateOfBirth: "2014-01-01",
  guardianName: "Guardian name",
  phone: "01700000000",
  address: "Isolated applicant address",
};
const cls = {
  id: "class1",
  name: "Class 6 Morning",
  totalSeats: 1,
  availableSeats: 1,
  heldSeats: 0,
  confirmedSeats: 0,
};
const documents = [
  {
    id: "birth",
    kind: "BirthCertificate",
    originalName: "certificate.png",
    reviewStatus: "Pending",
  },
  {
    id: "photo",
    kind: "Photograph",
    originalName: "photo.png",
    reviewStatus: "Pending",
  },
];
const submission = {
  id: "app1",
  classId: cls.id,
  className: cls.name,
  status: "PendingReview",
  version: 1,
  submittedAt: "2026-11-10T03:00:00Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState({}, "", "/");
});

it("submits documents that have not been verified, without reserving capacity or starting payment", async () => {
  let submitted = false;
  vi.mocked(request).mockImplementation(async (path, method) => {
    if (path === "/auth/me") return account;
    if (path === "/portal") return {};
    if (path === "/classes") return [cls];
    if (path === "/class-fees") return [{ classId: cls.id, amount: 500 }];
    if (path === "/profile/documents") return documents;
    if (path === "/applications" && method === "POST") {
      submitted = true;
      return submission;
    }
    if (path === "/applications/mine") return submitted ? [submission] : [];
    return [];
  });
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Apply to this class" }),
  );
  expect(await screen.findByRole("dialog")).toHaveTextContent(
    "certificate.png",
  );
  expect(
    screen.getByRole("button", { name: "Submit application" }),
  ).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Submit application" }));
  expect(await screen.findByText("Under review")).toBeVisible();
  expect(
    screen.getByText(
      "Waiting for review. No seat held and no payment timer running.",
    ),
  ).toBeVisible();
  expect(request).toHaveBeenCalledWith("/applications", "POST", {
    classId: cls.id,
  });
  expect(request).not.toHaveBeenCalledWith("/classes/class1/holds", "POST", {});
  expect(
    screen.queryByRole("button", { name: "Pay with Stripe" }),
  ).not.toBeInTheDocument();
});

it("shows correction feedback and lets the student resubmit the application", async () => {
  vi.mocked(request).mockImplementation(async (path) => {
    if (path === "/auth/me") return account;
    if (path === "/portal") return {};
    if (path === "/classes") return [cls];
    if (path === "/class-fees") return [{ classId: cls.id, amount: 500 }];
    if (path === "/profile/documents") return documents;
    if (path === "/applications/mine")
      return [
        {
          ...submission,
          status: "ChangesRequested",
          reviewNote:
            "Certificate date of birth is unreadable. Upload a clearer copy.",
        },
      ];
    return [];
  });
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "My applications" }),
  );
  expect(
    await screen.findByText(/Certificate date of birth is unreadable/),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Resubmit application" }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith("/applications", "POST", {
      classId: cls.id,
    }),
  );
});

it("gives the administrator class and profile context and requires inspection of both required documents", async () => {
  vi.mocked(request).mockImplementation(async (path) => {
    if (path === "/auth/me") return { ...account, role: "Admin" };
    if (path === "/portal") return {};
    if (path === "/classes") return [cls];
    if (path === "/class-fees") return [];
    if (path === "/admin/overview")
      return {
        students: 1,
        applications: 1,
        confirmed: 0,
        activeHolds: 0,
        revenue: 0,
        pendingApplications: 1,
        failedNotifications: 0,
        refundRequired: 0,
        integrations: { stripe: false, email: false, sms: false },
      };
    if (path.startsWith("/admin/applications?"))
      return {
        items: [
          { ...submission, fullName: account.fullName, email: account.email },
        ],
        total: 1,
      };
    if (path === "/admin/applications/app1")
      return { ...submission, applicant: account, documents };
    return {};
  });
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Application review" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Review application" }),
  );
  expect(await screen.findByText("Guardian name")).toBeVisible();
  expect(screen.getByText("2014-01-01")).toBeVisible();
  expect(screen.getByText("Class 6 Morning")).toBeVisible();
  const approve = screen.getByRole("button", { name: "Approve application" });
  expect(approve).toBeDisabled();
  const checks = screen.getAllByRole("checkbox");
  fireEvent.click(checks[0]);
  expect(approve).toBeDisabled();
  fireEvent.click(checks[1]);
  expect(approve).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "Request corrections" }),
  ).toBeDisabled();
  fireEvent.click(approve);
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/admin/applications/app1/review",
      "PUT",
      {
        status: "Approved",
        version: 1,
        note: "",
        reviewedDocumentIds: ["birth", "photo"],
      },
    ),
  );
});
