import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Pencil, Plus, Target, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "@/components/marcia/page-kit";
import { FinanceError, FinanceLoading } from "@/components/finance/finance-states";
import { Button } from "@/components/ui/button";
import { InvestmentFormDialog, PatrimonyGoalDialog } from "@/components/finance/investment-dialogs";
import {
  getInvestmentPortfolio,
  removeInvestment,
  type InvestmentPortfolio,
  type InvestmentRecord,
} from "@/lib/investments.functions";
import { INVESTMENT_TYPE_LABELS } from "@/lib/investment-types";
import { brandedRouteHead } from "@/config/brand";

export const Route = createFileRoute("/app/investimentos")({
  head: brandedRouteHead("Investimentos e patrimônio"),
  component: InvestmentsPage,
});

function InvestmentsPage() {
  const companyId = Route.useRouteContext().company?.id;
  const load = useServerFn(getInvestmentPortfolio);
  const remove = useServerFn(removeInvestment);
  const [portfolio, setPortfolio] = useState<InvestmentPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [editing, setEditing] = useState<InvestmentRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId) {
      setPortfolio({ targetCents: 0, investments: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setPortfolio(await load({ data: { companyId } }));
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível carregar os investimentos.",
      );
    } finally {
      setLoading(false);
    }
  }, [companyId, load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const investedCents = useMemo(
    () => (portfolio?.investments || []).reduce((sum, item) => sum + item.valueCents, 0),
    [portfolio?.investments],
  );
  const targetCents = portfolio?.targetCents || 0;
  const rawProgress = targetCents > 0 ? (investedCents / targetCents) * 100 : 0;
  const progress = Math.min(100, rawProgress);
  const remainingCents = Math.max(0, targetCents - investedCents);

  function startCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function startEdit(item: InvestmentRecord) {
    setEditing(item);
    setFormOpen(true);
  }

  async function deleteInvestment(item: InvestmentRecord) {
    const accepted = window.confirm(`Remover “${item.name}” da lista de investimentos?`);
    if (!accepted || !companyId) return;
    setDeletingId(item.id);
    try {
      await remove({ data: { companyId, investmentId: item.id } });
      toast.success("Investimento removido.");
      await refresh();
    } catch (caught: unknown) {
      toast.error(
        caught instanceof Error ? caught.message : "Não foi possível remover o investimento.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (loading && !portfolio) return <FinanceLoading />;
  if (error && !portfolio) return <FinanceError message={error} retry={refresh} />;

  const investments = portfolio?.investments || [];
  const percentageLabel = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(
    progress,
  );

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        eyebrow="Patrimônio e aplicações"
        title="Investimentos"
        description="Registre o saldo atual das suas aplicações e acompanhe a meta patrimonial."
        action={
          <Button onClick={startCreate} className="rounded-xl bg-[color:var(--brand)]">
            <Plus /> Novo investimento
          </Button>
        }
      />

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
        >
          {error}{" "}
          <button className="ml-2 font-bold underline" onClick={() => void refresh()}>
            Tentar novamente
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.5fr)]">
        <section className="flex items-center gap-4 rounded-[26px] border border-emerald-200 bg-gradient-to-br from-white to-emerald-50 p-5 shadow-[var(--shadow-card)] sm:p-6">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
            <TrendingUp className="size-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[.12em] text-emerald-800">
              Total investido
            </p>
            <p className="mt-1 truncate font-display text-2xl font-black text-emerald-950">
              {formatBRL(investedCents)}
            </p>
            <p className="mt-1 text-xs text-emerald-800">
              {investments.length} {investments.length === 1 ? "registro" : "registros"} nesta conta
            </p>
          </div>
        </section>

        <section className="rounded-[26px] border border-violet-200 bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-violet-100 text-violet-700">
                <Target className="size-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[.12em] text-violet-800">
                  Meta de patrimônio
                </p>
                <p className="mt-0.5 font-display text-xl font-black">
                  {targetCents > 0 ? formatBRL(targetCents) : "Ainda não definida"}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setGoalOpen(true)}
            >
              {targetCents > 0 ? "Editar meta" : "Definir meta"}
            </Button>
          </div>

          {targetCents > 0 ? (
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-bold text-violet-800">{percentageLabel}% alcançados</span>
                <span className="text-right text-muted-foreground">
                  {investedCents >= targetCents
                    ? `Meta atingida${investedCents > targetCents ? ` · ${formatBRL(investedCents - targetCents)} acima` : ""}`
                    : `Faltam ${formatBRL(remainingCents)}`}
                </span>
              </div>
              <div
                className="h-3 overflow-hidden rounded-full bg-violet-100"
                role="progressbar"
                aria-label="Progresso da meta patrimonial"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-valuetext={`${percentageLabel}% alcançados`}
              >
                <div
                  className="h-full rounded-full bg-[color:var(--brand)] transition-[width] duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Progresso calculado pela soma dos investimentos cadastrados nesta aba.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Defina um valor para ver quanto já avançou e quanto falta para alcançar sua meta.
            </p>
          )}
        </section>
      </div>

      <section className="rounded-[26px] border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-black">Meus investimentos</h2>
            <p className="text-sm text-muted-foreground">
              Atualize os saldos manualmente quando desejar.
            </p>
          </div>
          {investments.length > 0 && (
            <Button variant="outline" size="sm" onClick={startCreate} className="rounded-xl">
              <Plus /> Adicionar
            </Button>
          )}
        </div>

        {loading && !portfolio ? (
          <FinanceLoading />
        ) : investments.length === 0 ? (
          <EmptyState
            title="Nenhum investimento cadastrado"
            description="Adicione uma aplicação com o valor atual para começar a acompanhar seu patrimônio investido."
            action={
              <Button onClick={startCreate} className="rounded-xl bg-[color:var(--brand)]">
                <Plus /> Registrar investimento
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-border">
            {investments.map((item) => (
              <article
                key={item.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700">
                    <Building2 className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-bold">{item.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {INVESTMENT_TYPE_LABELS[item.type]}
                      {item.institution ? ` · ${item.institution}` : ""}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Atualizado em {formatDate(item.updatedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <p className="font-display text-lg font-black tabular-nums">
                    {formatBRL(item.valueCents)}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${item.name}`}
                      title={`Editar ${item.name}`}
                      onClick={() => startEdit(item)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover ${item.name}`}
                      title={`Remover ${item.name}`}
                      disabled={deletingId === item.id}
                      onClick={() => void deleteInvestment(item)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 rounded-2xl border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
        <Target className="mt-0.5 size-4 shrink-0" />
        Os saldos são informados manualmente. A barra considera apenas os investimentos cadastrados
        aqui; não inclui dinheiro em conta, imóveis ou dívidas.
      </p>

      {companyId && (
        <>
          <InvestmentFormDialog
            open={formOpen}
            companyId={companyId}
            investment={editing}
            onOpenChange={setFormOpen}
            onSaved={() => void refresh()}
          />
          <PatrimonyGoalDialog
            open={goalOpen}
            companyId={companyId}
            currentTargetCents={targetCents}
            onOpenChange={setGoalOpen}
            onSaved={() => void refresh()}
          />
        </>
      )}
    </div>
  );
}

function formatBRL(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(
        date,
      );
}
