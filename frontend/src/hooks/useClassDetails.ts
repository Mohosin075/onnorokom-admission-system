import { useCallback, useEffect, useState } from "react";
import { api, getErrorMessage } from "../services/api";
import type { ClassItem } from "../types";

export function useClassDetails(classId: string | null) {
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    id: string;
    revision: number;
    data: ClassItem | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!classId) return;
    let disposed = false;
    let fetching = false;
    const load = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const data = await api.getClassById(classId);
        if (!disposed)
          setSnapshot({ id: classId, revision, data, error: null });
      } catch (error) {
        if (!disposed)
          setSnapshot((previous) => ({
            id: classId,
            revision,
            data: previous?.id === classId ? previous.data : null,
            error: getErrorMessage(error),
          }));
      } finally {
        fetching = false;
      }
    };
    const initial = setTimeout(() => void load(), 0);
    const interval = setInterval(() => void load(), 3000);
    return () => {
      disposed = true;
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [classId, revision]);

  const current = snapshot?.id === classId && snapshot.revision === revision
    ? snapshot : null;
  const retry = useCallback(() => setRevision((value) => value + 1), []);
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: Boolean(classId && !current),
    retry,
  };
}
