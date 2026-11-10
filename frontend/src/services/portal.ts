export const base = import.meta.env.VITE_API_URL || "/api";
export interface Account {
  id: string;
  email: string;
  role: string;
  fullName: string;
  birthRegistration?: string;
  dateOfBirth?: string;
  guardianName: string;
  phone: string;
  address: string;
}
export interface ClassRoom {
  id: string;
  name: string;
  totalSeats: number;
  heldSeats: number;
  confirmedSeats: number;
  availableSeats: number;
}
export interface Application {
  holdId: string;
  classId: string;
  className: string;
  status: string;
  expiresAt: string;
}
export interface AdmissionSubmission {
  id: string;
  classId: string;
  className: string;
  status: "PendingReview" | "Approved" | "ChangesRequested" | "Rejected";
  version: number;
  submittedAt: string;
  reviewedAt?: string;
  reviewNote?: string;
}
export interface ReviewDetail extends AdmissionSubmission {
  reviewedBy?: string;
  fee?: number;
  applicant: {
    fullName: string;
    birthRegistration: string;
    dateOfBirth: string;
    guardianName: string;
    phone: string;
    address: string;
    email: string;
  };
  documents: Document[];
}
export interface Document {
  sha256?: string;
  id: string;
  kind: string;
  originalName: string;
  reviewStatus: string;
  reviewNote?: string;
  fullName?: string;
  email?: string;
  birthRegistration?: string;
}
export interface Payment {
  id: string;
  holdId: string;
  amount: number;
  status: string;
}
export interface Overview {
  students: number;
  applications: number;
  confirmed: number;
  activeHolds: number;
  revenue: number;
  pendingApplications: number;
  failedNotifications: number;
  refundRequired: number;
  integrations: { stripe: boolean; email: boolean; sms: boolean };
}
export interface RecordRow {
  id: string;
  fullName?: string;
  email?: string;
  className?: string;
  birthRegistration?: string;
  status?: string;
  subject?: string;
  channel?: string;
  attempts?: number;
  sentAt?: string;
  lastError?: string;
  amount?: number;
  holdId?: string;
  action?: string;
  resourceId?: string;
  createdAt?: string;
}
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== "GET") {
    const response = await fetch(base + "/auth/csrf", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error("Secure session unavailable. Refresh and retry.");
    headers["X-CSRF-TOKEN"] = (await response.json()).token;
  }
  const multipart = body instanceof FormData;
  if (body && !multipart) headers["Content-Type"] = "application/json";
  const response = await fetch(base + path, {
    method,
    credentials: "include",
    headers,
    body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      data.message ||
        Object.values(data.errors || {})
          .flat()
          .join(" ") ||
        (response.status === 401
          ? "Please sign in to continue."
          : response.status === 403
            ? "You do not have access to this action."
            : response.status === 429
              ? "Too many requests. Please wait a minute."
              : "Request failed. Please retry."),
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
