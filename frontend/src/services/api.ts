import axios, { type AxiosError } from "axios";
import type {
  ClassItem,
  CreateClassPayload,
  CreateClassResponse,
  HoldItem,
  ConfirmHoldResponse,
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

const apiClient = axios.create({
  timeout: 10000,
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export const api = {
  // Classes
  async getClasses(): Promise<ClassItem[]> {
    const response = await apiClient.get<ClassItem[]>("/classes");
    return response.data;
  },

  async getClassById(classId: string): Promise<ClassItem> {
    const response = await apiClient.get<ClassItem>(`/classes/${classId}`);
    return response.data;
  },

  async createClass(payload: CreateClassPayload): Promise<CreateClassResponse> {
    const response = await apiClient.post<CreateClassResponse>(
      "/classes",
      payload,
    );
    return response.data;
  },

  // Holds
  async createHold(classId: string, studentId: string): Promise<HoldItem> {
    const response = await apiClient.post<HoldItem>(
      `/classes/${classId}/holds`,
      {},
      {
        headers: {
          "X-Student-Id": studentId,
        },
      },
    );
    return response.data;
  },

  async getHoldById(holdId: string): Promise<HoldItem> {
    const response = await apiClient.get<HoldItem>(`/holds/${holdId}`);
    return response.data;
  },

  async confirmHold(
    holdId: string,
    studentId: string,
  ): Promise<ConfirmHoldResponse> {
    const response = await apiClient.post<ConfirmHoldResponse>(
      `/holds/${holdId}/confirm`,
      {},
      {
        headers: {
          "X-Student-Id": studentId,
        },
      },
    );
    return response.data;
  },

  async cancelHold(holdId: string, studentId: string): Promise<void> {
    await apiClient.delete(`/holds/${holdId}`, {
      headers: {
        "X-Student-Id": studentId,
      },
    });
  },

  // Student specific holds
  async getMyHolds(studentId: string): Promise<HoldItem[]> {
    const response = await apiClient.get<HoldItem[]>("/me/holds", {
      headers: {
        "X-Student-Id": studentId,
      },
    });
    return response.data;
  },
};

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{
      message?: string;
      error?: string;
      title?: string;
    }>;
    if (axiosError.response?.data?.message) {
      return axiosError.response.data.message;
    }
    if (axiosError.response?.data?.error) {
      return axiosError.response.data.error;
    }
    if (axiosError.response?.data?.title) {
      return axiosError.response.data.title;
    }
    if (axiosError.response?.status === 409) {
      return "This class may be full, or you may have already applied. Check My applications before trying again.";
    }
    if (axiosError.response?.status === 404) {
      return "We could not find this class or application. Refresh the page and try again.";
    }
    if (axiosError.code === "ERR_NETWORK") {
      return "We could not connect. Check your internet connection and try again.";
    }
    if (axiosError.code === "ECONNABORTED") {
      return "This is taking longer than usual. Please try again.";
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "We could not finish that. Please try again.";
}
