import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getFinanceDashboard,
  type FinanceDashboardSnapshot,
} from "@/lib/finance-dashboard.functions";

export function useFinanceDashboard(
  companyId?: string | null,
  period?: { from: string; to: string } | null,
) {
  const getDashboard = useServerFn(getFinanceDashboard);
  const [data, setData] = useState<FinanceDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const from = period?.from ?? null;
  const to = period?.to ?? null;

  const refresh = useCallback(async () => {
    const requestId = ++requestSequence.current;
    if (!companyId) {
      setData(null);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const next = await getDashboard({ data: { companyId, from, to } });
      if (requestSequence.current === requestId) setData(next);
    } catch (nextError: unknown) {
      if (requestSequence.current === requestId) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Não foi possível carregar seus dados financeiros.",
        );
      }
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [companyId, from, to, getDashboard]);

  useEffect(() => {
    void refresh();
    return () => {
      requestSequence.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    const onUpdate = () => void refresh();
    window.addEventListener("marcia:finance-updated", onUpdate);
    return () => {
      requestSequence.current += 1;
      window.removeEventListener("marcia:finance-updated", onUpdate);
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}
