import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { brandedRouteHead } from "@/config/brand";
import { FinanceCardOverview } from "@/components/finance/finance-card-overview";
import { FinanceError, FinanceLoading } from "@/components/finance/finance-states";
import { getFinanceCardLedger, type FinanceCardLedger } from "@/lib/finance-card-payment.functions";

export const Route = createFileRoute("/app/cartao")({
  head: brandedRouteHead("Cartão"),
  component: FinanceCardPage,
});

function FinanceCardPage() {
  const ctx = Route.useRouteContext();
  const companyId = ctx.company?.id;
  const getLedger = useServerFn(getFinanceCardLedger);
  const [data, setData] = useState<FinanceCardLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

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
      const next = await getLedger({ data: { companyId } });
      if (requestSequence.current === requestId) setData(next);
    } catch (reason: unknown) {
      if (requestSequence.current === requestId) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível carregar o histórico do cartão.",
        );
      }
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [companyId, getLedger]);

  useEffect(() => {
    void refresh();
    const onUpdate = () => void refresh();
    window.addEventListener("marcia:finance-updated", onUpdate);
    return () => {
      requestSequence.current += 1;
      window.removeEventListener("marcia:finance-updated", onUpdate);
    };
  }, [refresh]);

  if (loading && !data) return <FinanceLoading />;
  if (error && !data) return <FinanceError message={error} retry={() => void refresh()} />;
  if (!companyId || !data) return null;

  return (
    <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
      {error ? <FinanceError message={error} retry={() => void refresh()} /> : null}
      <FinanceCardOverview
        companyId={companyId}
        data={data}
        onPaid={() => {
          window.dispatchEvent(new CustomEvent("marcia:finance-updated"));
          void refresh();
        }}
      />
    </div>
  );
}
