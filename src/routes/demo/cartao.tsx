import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FinanceCardOverview } from "@/components/finance/finance-card-overview";
import { formatMoney as financeMoney } from "@/components/finance/finance-states";
import { LoadingBlocks } from "@/components/marcia/page-kit";
import { ClientOnly } from "@tanstack/react-router";
import { buildDemoCardLedger, settleDemoCardLedger } from "@/lib/finance-demo-data";
import { toIsoDate } from "@/lib/finance-period";

export const Route = createFileRoute("/demo/cartao")({
  component: DemoCardRoute,
});

function DemoCardRoute() {
  return (
    <ClientOnly fallback={<LoadingBlocks count={6} />}>
      <DemoCardPage />
    </ClientOnly>
  );
}

function DemoCardPage() {
  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => toIsoDate(today), [today]);
  const original = useMemo(() => buildDemoCardLedger(today), [today]);
  const [paymentBatchId, setPaymentBatchId] = useState<string | null>(null);
  const data = useMemo(() => {
    if (!paymentBatchId) return original;
    return settleDemoCardLedger(original, paymentBatchId, todayIso, "Conta de demonstração");
  }, [original, paymentBatchId, todayIso]);

  const paymentPanel = (
    <section className="flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-4 sm:flex-row sm:items-center dark:border-violet-900 dark:bg-violet-950/20">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200">
        <CreditCard className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-black">Simulação local</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {data.pendingCount > 0
            ? `${data.pendingCount} compra(s), ${financeMoney(data.pendingTotalCents)} acumuladas entre meses. O caixa demo só muda ao clicar; nenhum dado real é gravado.`
            : "O pagamento foi simulado. As compras continuam no histórico com data, valor e categoria."}
        </p>
      </div>
      {data.pendingCount > 0 ? (
        <Button
          type="button"
          size="sm"
          className="shrink-0 rounded-xl bg-violet-700 hover:bg-violet-800"
          onClick={() => setPaymentBatchId(`demo-${Date.now()}`)}
        >
          Simular pagamento · {financeMoney(data.pendingTotalCents)}
        </Button>
      ) : null}
    </section>
  );

  return <FinanceCardOverview data={data} onPaid={() => undefined} paymentPanel={paymentPanel} />;
}
