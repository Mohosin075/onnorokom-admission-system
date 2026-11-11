import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useClassDetails } from "../hooks/useClassDetails";
import { api } from "../services/api";
import type { ClassItem } from "../types";

vi.mock("../services/api", () => ({
  api: { getClassById: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });
const cls = (id: string): ClassItem => ({
  id, name: id, totalSeats: 5, heldSeats: 0, confirmedSeats: 0, availableSeats: 5,
});

it("ignores an old class response after switching classes", async () => {
  let finishOld!: (value: ClassItem) => void;
  vi.mocked(api.getClassById).mockImplementation((id) => id === "old"
    ? new Promise((resolve) => { finishOld = resolve; }) : Promise.resolve(cls(id)));
  const { result, rerender } = renderHook(({ id }) => useClassDetails(id), { initialProps: { id: "old" } });
  await waitFor(() => expect(api.getClassById).toHaveBeenCalledWith("old"));
  rerender({ id: "new" });
  expect(result.current.data).toBeNull();
  await waitFor(() => expect(result.current.data?.id).toBe("new"));
  await act(async () => finishOld(cls("old")));
  expect(result.current.data?.id).toBe("new");
});

it("does not overlap slow polls and refreshes seat counts when the response completes", async () => {
  vi.useFakeTimers();
  let finish!: (value: ClassItem) => void;
  vi.mocked(api.getClassById).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }))
    .mockResolvedValue({ ...cls("selected"), heldSeats: 5, availableSeats: 0 });
  const { result } = renderHook(() => useClassDetails("selected"));
  await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
  expect(api.getClassById).toHaveBeenCalledTimes(1);
  expect(result.current.loading).toBe(true);
  await act(async () => finish(cls("selected")));
  expect(result.current.data?.availableSeats).toBe(5);
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(api.getClassById).toHaveBeenCalledTimes(2);
  expect(result.current.data?.availableSeats).toBe(0);
});
