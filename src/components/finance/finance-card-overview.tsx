import { useMemo, useState, type ReactNode } from "react";
import { CreditCard, WalletCards } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  FinanceCardLedger,
  FinanceCardLedgerItem,
} from "@/lib/finance-card-payment.functions";
import { formatMoney as financeMoney } from "@/components/finance/finance-states";
import { FinanceCardPaymentPanel } from "./finance-card-payment-panel";

const monthLabel = (key: string) =>
  new Date(`${key}-01T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

const shortMonthLabel = (key: string) =>
  new Date(`${key}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

const dateLabel = (value: string | null) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Data não registrada";

type CategoryTotal = {
  id: string;
  name: string;
  color: string;
  amountCents: number;
  count: number;
};

type CategoryScope = "pending" | "all" | "allPayments";

type MonthGroup = {
  month: string;
  items: FinanceCardLedgerItem[];
  totalCents: number;
  pendingCents: number;
  paidCents: number;
  legacyCents: number;
  categories: CategoryTotal[];
};

type PaymentGroup = {
  id: string;
  date: string | null;
  accountName: string | null;
  items: FinanceCardLedgerItem[];
  totalCents: number;
  categories: CategoryTotal[];
};

function categoryTotals(items: FinanceCardLedgerItem[]): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>();
  for (const item of items) {
    const id = item.categoryId || "uncategorized";
    const current = totals.get(id) || {
      id,
      name: item.categoryName,
      color: item.categoryColor,
      amountCents: 0,
      count: 0,
    };
    current.amountCents += item.amountCents;
    current.count += 1;
    totals.set(id, current);
  }
  return Array.from(totals.values()).sort((a, b) => b.amountCents - a.amountCents);
}

function buildMonthGroups(items: FinanceCardLedgerItem[]): MonthGroup[] {
  const groups = new Map<string, FinanceCardLedgerItem[]>();
  for (const item of items) {
    const month = item.date.slice(0, 7) || "sem-data";
    groups.set(month, [...(groups.get(month) || []), item]);
  }
  return Array.from(groups.entries())
    .map(([month, monthItems]) => ({
      month,
      items: monthItems,
      totalCents: monthItems.reduce((sum, item) => sum + item.amountCents, 0),
      pendingCents: monthItems
        .filter((item) => item.settlement === "pending")
        .reduce((sum, item) => sum + item.amountCents, 0),
      paidCents: monthItems
        .filter((item) => item.settlement === "paid")
        .reduce((sum, item) => sum + item.amountCents, 0),
      legacyCents: monthItems
        .filter((item) => item.settlement === "legacy")
        .reduce((sum, item) => sum + item.amountCents, 0),
      categories: categoryTotals(monthItems),
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

function buildPaymentGroups(items: FinanceCardLedgerItem[]): PaymentGroup[] {
  const groups = new Map<string, FinanceCardLedgerItem[]>();
  for (const item of items.filter((entry) => entry.settlement === "paid")) {
    const key =
      item.paymentBatchId ||
      `${item.paymentDate || "sem-data"}-${item.paymentAccountName || "sem-conta"}`;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return Array.from(groups.entries())
    .map(([id, groupItems]) => ({
      id,
      date: groupItems[0]?.paymentDate || null,
      accountName: groupItems[0]?.paymentAccountName || null,
      items: groupItems,
      totalCents: groupItems.reduce((sum, item) => sum + item.amountCents, 0),
      categories: categoryTotals(groupItems),
    }))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function PaymentState({ item }: { item: FinanceCardLedgerItem }) {
  if (item.settlement === "pending") {
    return (
      <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-bold text-violet-800 dark:bg-violet-950/60 dark:text-violet-200">
        Em aberto
      </span>
    );
  }
  if (item.settlement === "paid") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
        Pago em {dateLabel(item.paymentDate)}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">
      Histórico antigo sem baixa vinculada
    </span>
  );
}

export function FinanceCardOverview({
  companyId,
  data,
  onPaid,
  paymentPanel,
}: {
  companyId?: string;
  data: FinanceCardLedger;
  onPaid: () => void;
  paymentPanel?: ReactNode;
}) {
  const [categoryScope, setCategoryScope] = useState<CategoryScope>("allPayments");
  const monthGroups = useMemo(() => buildMonthGroups(data.items), [data.items]);
  const payments = useMemo(() => buildPaymentGroups(data.items), [data.items]);
  const allCategories = useMemo(() => categoryTotals(data.items), [data.items]);
  const openCategories = useMemo(
    () => categoryTotals(data.items.filter((item) => item.settlement === "pending")),
    [data.items],
  );
  const chartCategories =
    categoryScope === "pending"
      ? openCategories
      : categoryScope === "all"
        ? allCategories
        : data.allPaymentExpenseCategories.map((category) => ({
            id: category.id,
            name: category.name,
            color: category.color,
            amountCents: category.amountCents,
            count: category.expenseCount,
          }));
  const categoryTotalCents =
    categoryScope === "allPayments"
      ? data.allPaymentExpenseTotalCents
      : chartCategories.reduce((sum, item) => sum + item.amountCents, 0);
  const monthlyChart = [...monthGroups]
    .filter((group) => group.month !== "sem-data")
    .reverse()
    .map((group) => ({
      month: shortMonthLabel(group.month),
      pending: group.pendingCents / 100,
      paid: group.paidCents / 100,
      legacy: group.legacyCents / 100,
    }));
  const legacyItems = data.items.filter((item) => item.settlement === "legacy");
  const allRecordedCents = data.items.reduce((sum, item) => sum + item.amountCents, 0);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-[.18em] text-violet-700 dark:text-violet-300">
            Controle do cartão
          </div>
          <h1 className="mt-1 font-display text-2xl font-black tracking-[-.04em] sm:text-[28px]">
            Gastos no cartão
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            As compras ficam acumuladas entre meses até você confirmar o pagamento. A quitação
            guarda a data, a conta e todas as compras originais por categoria.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
          <CreditCard className="size-4 text-violet-600" /> Sem baixa por limite ou vencimento
        </div>
      </header>

      {paymentPanel ??
        (companyId ? (
          <FinanceCardPaymentPanel
            companyId={companyId}
            accounts={data.accounts}
            pendingTotalCents={data.pendingTotalCents}
            pendingCount={data.pendingCount}
            onPaid={onPaid}
          />
        ) : null)}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Resumo do cartão">
        <SummaryMetric
          label="Acumulado aguardando pagamento"
          value={financeMoney(data.pendingTotalCents)}
          helper={`${data.pendingCount} compra(s) de todos os meses`}
          tone="violet"
        />
        <SummaryMetric
          label="Compras registradas"
          value={financeMoney(allRecordedCents)}
          helper={`${data.items.length} compra(s) preservadas no histórico`}
          tone="brand"
        />
        <SummaryMetric
          label="Pagamentos registrados"
          value={financeMoney(data.settledTotalCents)}
          helper={`${payments.length} quitação(ões) com histórico`}
          tone="emerald"
        />
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(300px,.82fr)_minmax(0,1.18fr)]">
        <CategoryDonut
          categories={chartCategories}
          totalCents={categoryTotalCents}
          scope={categoryScope}
          onScopeChange={setCategoryScope}
          allPaymentExpenseCount={data.allPaymentExpenseCount}
        />
        <MonthlyChart data={monthlyChart} />
      </section>

      {data.legacyCount > 0 ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/20">
          <h2 className="font-black text-amber-950 dark:text-amber-100">
            {data.legacyCount} lançamento(s) antigo(s) sem confirmação de quitação
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/80 dark:text-amber-200/80">
            Eles aparecem no gráfico e no histórico por mês/categoria, mas não entram no acumulado
            pendente porque o sistema não sabe se a fatura já foi paga. Não alterei registros
            antigos automaticamente para evitar descontar ou devolver dinheiro duas vezes.
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-black">Gastos mês a mês</h2>
          <p className="text-xs text-muted-foreground">
            Cada compra continua ligada ao mês e à categoria em que foi registrada.
          </p>
        </div>
        {monthGroups.length ? (
          <div className="space-y-2">
            {monthGroups.map((group, index) => (
              <details
                key={group.month}
                open={index === 0}
                className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <span className="min-w-36 flex-1 font-display text-base font-black capitalize">
                    {group.month === "sem-data" ? "Sem competência" : monthLabel(group.month)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {group.items.length} compra(s)
                  </span>
                  <strong className="text-sm tabular-nums">{financeMoney(group.totalCents)}</strong>
                  <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                    Em aberto {financeMoney(group.pendingCents)}
                  </span>
                </summary>
                <div className="border-t border-border px-4 pb-4 pt-3">
                  <div className="mb-3 flex flex-wrap gap-2">
                    {group.categories.map((category) => (
                      <span
                        key={category.id}
                        className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold"
                      >
                        <i
                          className="mr-1.5 inline-block size-2 rounded-full"
                          style={{ background: category.color }}
                        />
                        {category.name} · {financeMoney(category.amountCents)}
                      </span>
                    ))}
                  </div>
                  <div className="divide-y divide-border">
                    {group.items.map((item) => (
                      <LedgerRow key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <EmptyCard message="Ainda não há gastos de cartão registrados." />
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-black">Histórico de pagamentos</h2>
          <p className="text-xs text-muted-foreground">
            Cada confirmação inicia um novo acumulado, sem apagar as compras já quitadas.
          </p>
        </div>
        {payments.length ? (
          <div className="space-y-2">
            {payments.map((payment) => (
              <details key={payment.id} className="rounded-2xl border border-border bg-card p-4">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="grid size-9 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <WalletCards className="size-4" />
                  </span>
                  <span className="min-w-36 flex-1">
                    <strong className="block text-sm">
                      Pagamento em {dateLabel(payment.date)}
                    </strong>
                    <span className="text-[11px] text-muted-foreground">
                      {payment.items.length} compra(s)
                      {payment.accountName ? ` · ${payment.accountName}` : ""}
                    </span>
                  </span>
                  <strong className="text-sm tabular-nums">
                    {financeMoney(payment.totalCents)}
                  </strong>
                </summary>
                <div className="mt-3 border-t border-border pt-3">
                  <div className="mb-3 flex flex-wrap gap-2">
                    {payment.categories.map((category) => (
                      <span
                        key={category.id}
                        className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold"
                      >
                        <i
                          className="mr-1.5 inline-block size-2 rounded-full"
                          style={{ background: category.color }}
                        />
                        {category.name} · {financeMoney(category.amountCents)}
                      </span>
                    ))}
                  </div>
                  <div className="divide-y divide-border">
                    {payment.items.map((item) => (
                      <LedgerRow key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <EmptyCard message="As próximas quitações aparecerão aqui com data, valor e detalhamento por categoria." />
        )}
      </section>

      {legacyItems.length ? (
        <details className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-black">
            Ver lançamentos antigos sem baixa vinculada ({legacyItems.length})
          </summary>
          <div className="mt-3 divide-y divide-border">
            {legacyItems.map((item) => (
              <LedgerRow key={item.id} item={item} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "violet" | "brand" | "emerald";
}) {
  const style = {
    violet:
      "border-violet-200 bg-violet-50/70 text-violet-900 dark:border-violet-900 dark:bg-violet-950/20 dark:text-violet-100",
    brand: "border-border bg-card text-foreground",
    emerald:
      "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100",
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 shadow-[var(--shadow-card)] ${style}`}>
      <div className="text-xs font-bold text-muted-foreground">{label}</div>
      <strong className="mt-2 block font-display text-xl font-black tracking-tight">{value}</strong>
      <div className="mt-1 text-[11px] text-muted-foreground">{helper}</div>
    </div>
  );
}

function CategoryDonut({
  categories,
  totalCents,
  scope,
  onScopeChange,
  allPaymentExpenseCount,
}: {
  categories: CategoryTotal[];
  totalCents: number;
  scope: CategoryScope;
  onScopeChange: (scope: CategoryScope) => void;
  allPaymentExpenseCount: number;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-black">Despesas por categoria</h2>
          <p className="text-[11px] text-muted-foreground">
            {scope === "pending"
              ? "Compras de cartão ainda não quitadas"
              : scope === "all"
                ? "Todo o histórico de compras no cartão"
                : `${allPaymentExpenseCount} despesas realizadas · inclui cartão em aberto`}
          </p>
        </div>
        <div className="flex flex-wrap rounded-xl border border-border p-0.5 text-[10px] font-bold">
          <button
            type="button"
            onClick={() => onScopeChange("pending")}
            className={`rounded-lg px-2 py-1.5 ${scope === "pending" ? "bg-violet-700 text-white" : "text-muted-foreground"}`}
          >
            Em aberto
          </button>
          <button
            type="button"
            onClick={() => onScopeChange("all")}
            className={`rounded-lg px-2 py-1.5 ${scope === "all" ? "bg-violet-700 text-white" : "text-muted-foreground"}`}
          >
            Só cartão
          </button>
          <button
            type="button"
            onClick={() => onScopeChange("allPayments")}
            className={`rounded-lg px-2 py-1.5 ${scope === "allPayments" ? "bg-violet-700 text-white" : "text-muted-foreground"}`}
          >
            Todos os meios
          </button>
        </div>
      </div>
      {categories.length ? (
        <>
          <div className="relative mx-auto mt-2 h-[190px] max-w-[270px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip formatter={(value: number) => financeMoney(Number(value))} />
                <Pie
                  data={categories}
                  dataKey="amountCents"
                  nameKey="name"
                  innerRadius={54}
                  outerRadius={82}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {categories.map((item) => (
                    <Cell key={item.id} fill={item.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <strong className="font-display text-sm font-black">
                  {financeMoney(totalCents)}
                </strong>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  {scope === "pending"
                    ? "cartão em aberto"
                    : scope === "all"
                      ? "cartão histórico"
                      : "todas as formas"}
                </span>
              </div>
            </div>
          </div>
          <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
            {categories.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-xs">
                <span className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />
                <span className="min-w-0 flex-1 truncate font-semibold">{item.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {totalCents ? Math.round((item.amountCents / totalCents) * 100) : 0}%
                </span>
                <strong className="min-w-[90px] text-right tabular-nums">
                  {financeMoney(item.amountCents)}
                </strong>
              </div>
            ))}
          </div>
        </>
      ) : (
        <EmptyCard
          message={
            scope === "allPayments"
              ? "Ainda não há despesas realizadas para agrupar por categoria."
              : "Nenhum gasto nesta seleção. Use “Só cartão” ou “Todos os meios” para consultar o histórico."
          }
        />
      )}
    </section>
  );
}

function MonthlyChart({
  data,
}: {
  data: Array<{ month: string; pending: number; paid: number; legacy: number }>;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <h2 className="font-display text-base font-black">Cartão mês a mês</h2>
      <p className="text-[11px] text-muted-foreground">
        A compra permanece na competência em que aconteceu.
      </p>
      {data.length ? (
        <div className="mt-3 h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--hairline)" strokeDasharray="4 6" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={10} />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={10}
                tickFormatter={(value) =>
                  Math.abs(value) >= 1000
                    ? `${Math.round(value / 1000)}k`
                    : String(Math.round(value))
                }
              />
              <Tooltip formatter={(value: number) => financeMoney(Number(value) * 100)} />
              <Bar
                dataKey="pending"
                name="Em aberto"
                stackId="purchases"
                fill="#8B5CF6"
                radius={[0, 0, 0, 0]}
              />
              <Bar dataKey="paid" name="Quitado" stackId="purchases" fill="#10B981" />
              <Bar
                dataKey="legacy"
                name="Histórico antigo"
                stackId="purchases"
                fill="#94A3B8"
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyCard message="Os totais mensais do cartão aparecerão quando houver compras registradas." />
      )}
      <div className="mt-1 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        <span>
          <i className="mr-1.5 inline-block size-2 rounded-full bg-violet-500" />
          Em aberto
        </span>
        <span>
          <i className="mr-1.5 inline-block size-2 rounded-full bg-emerald-500" />
          Quitado
        </span>
        <span>
          <i className="mr-1.5 inline-block size-2 rounded-full bg-slate-400" />
          Histórico antigo
        </span>
      </div>
    </section>
  );
}

function LedgerRow({ item }: { item: FinanceCardLedgerItem }) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: item.categoryColor }}
          />
          <strong className="truncate text-sm">{item.description}</strong>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
          <span>{dateLabel(item.date)}</span>
          <span>·</span>
          <span>{item.categoryName}</span>
          {item.cardName ? (
            <>
              <span>·</span>
              <span>{item.cardName}</span>
            </>
          ) : null}
          {item.paymentAccountName ? (
            <>
              <span>·</span>
              <span>Pago pela conta {item.paymentAccountName}</span>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <PaymentState item={item} />
        <strong className="text-sm tabular-nums">{financeMoney(item.amountCents)}</strong>
      </div>
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
      {message}
    </p>
  );
}
