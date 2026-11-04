import { addDays } from "./finance-period";

export type FinanceCardSettlement = "pending" | "paid" | null;

export type FinanceBalanceEntry = {
  type: "receita" | "despesa";
  status: string;
  amountCents: number;
  competence: string;
  paymentMethod?: string | null;
  cardSettlement?: FinanceCardSettlement;
  paidAt?: string | null;
};

export type FinanceBalancePeriod = {
  from: string;
  to: string;
};

export type FinanceCashSummaryPeriod = "today" | "week" | "month" | "all";

export type FinanceBalanceRow = {
  tipo: "receita" | "despesa";
  status: string;
  valor_cents: number | string | null;
  competencia: string;
  forma_pagamento?: string | null;
  metadata?: unknown;
  pago_em?: string | null;
};

export type FinanceBalanceTotals = {
  openingBalanceCents: number;
  receivedCents: number;
  spentCents: number;
  cardExpenseCents: number;
  netCents: number;
  availableCents: number;
  pendingIncomeCents: number;
  pendingExpenseCents: number;
  leftoverCents: number;
};

export type FinanceCashSummary = FinanceBalanceTotals & {
  cardPendingCents: number;
};

const cents = (value: number) => (Number.isFinite(value) ? value : 0);

export function isFinancePendingStatus(status: string) {
  return status === "pendente" || status === "atrasado";
}

export function readFinanceCardSettlement(metadata: unknown): FinanceCardSettlement {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const state = (metadata as Record<string, unknown>).card_settlement;
  return state === "pending" || state === "paid" ? state : null;
}

export function financeBalanceEntryFromRow(row: FinanceBalanceRow): FinanceBalanceEntry {
  return {
    type: row.tipo,
    status: row.status,
    amountCents: Number(row.valor_cents || 0),
    competence: String(row.competencia).slice(0, 10),
    paymentMethod: row.forma_pagamento || null,
    cardSettlement: readFinanceCardSettlement(row.metadata),
    paidAt: row.pago_em || null,
  };
}

export function financeCashSummaryRange(
  period: FinanceCashSummaryPeriod,
  now = new Date(),
): FinanceBalancePeriod {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  if (period === "today") return { from: today, to: today };
  if (period === "week") return { from: addDays(today, -6), to: today };
  if (period === "month") {
    const last = new Date(`${today.slice(0, 7)}-01T12:00:00`);
    last.setMonth(last.getMonth() + 1, 0);
    return { from: `${today.slice(0, 7)}-01`, to: last.toISOString().slice(0, 10) };
  }
  return { from: "0001-01-01", to: today };
}

export function financeCardTransactionMetadata(
  type: string,
  paymentMethod: string | null | undefined,
  metadata: Record<string, unknown> = {},
) {
  if (type !== "despesa" || paymentMethod !== "cartao") return metadata;
  return { ...metadata, card_settlement: "pending" as const };
}

/**
 * O saldo bancário usa a data em que o dinheiro saiu, não a competência da compra.
 * Compras marcadas como pendentes de quitação do cartão só viram saída no clique de pagar.
 * Linhas antigas sem marcador preservam a interpretação anterior.
 */
export function getFinanceCashDate(entry: FinanceBalanceEntry): string | null {
  if (entry.status !== "pago" || entry.cardSettlement === "pending") return null;
  const date = entry.paidAt?.slice(0, 10) || entry.competence;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function sum(entries: FinanceBalanceEntry[], predicate: (entry: FinanceBalanceEntry) => boolean) {
  return entries.filter(predicate).reduce((total, entry) => total + cents(entry.amountCents), 0);
}

/**
 * Separa o caixa realizado do consumo no cartão: gastos são atribuídos à competência da compra,
 * enquanto saldo/entradas/saídas usam a data de pagamento efetiva.
 */
export function calculateFinanceBalance(
  entries: readonly FinanceBalanceEntry[],
  period: FinanceBalancePeriod,
): FinanceBalanceTotals {
  const activeEntries = entries.filter((entry) => entry.status !== "cancelado");
  const openingBalanceCents = activeEntries.reduce((total, entry) => {
    const cashDate = getFinanceCashDate(entry);
    if (!cashDate || cashDate >= period.from) return total;
    return (
      total + (entry.type === "receita" ? cents(entry.amountCents) : -cents(entry.amountCents))
    );
  }, 0);
  const periodEntries = activeEntries.filter(
    (entry) => entry.competence >= period.from && entry.competence <= period.to,
  );
  const cashPeriodEntries = activeEntries.filter((entry) => {
    const cashDate = getFinanceCashDate(entry);
    return cashDate != null && cashDate >= period.from && cashDate <= period.to;
  });
  const receivedCents = sum(cashPeriodEntries, (entry) => entry.type === "receita");
  const spentCents = sum(cashPeriodEntries, (entry) => entry.type === "despesa");
  const cardExpenseCents = sum(
    periodEntries,
    (entry) => entry.type === "despesa" && entry.paymentMethod === "cartao",
  );
  const pendingIncomeCents = sum(
    periodEntries,
    (entry) => entry.type === "receita" && isFinancePendingStatus(entry.status),
  );
  const pendingExpenseCents = sum(
    periodEntries,
    (entry) =>
      entry.type === "despesa" &&
      isFinancePendingStatus(entry.status) &&
      !(entry.paymentMethod === "cartao" && entry.cardSettlement === "pending"),
  );
  const netCents = receivedCents - spentCents;
  const availableCents = openingBalanceCents + netCents;

  return {
    openingBalanceCents,
    receivedCents,
    spentCents,
    cardExpenseCents,
    netCents,
    availableCents,
    pendingIncomeCents,
    pendingExpenseCents,
    leftoverCents: availableCents + pendingIncomeCents - pendingExpenseCents,
  };
}

export function summarizeFinanceCash(
  entries: readonly FinanceBalanceEntry[],
  period: FinanceBalancePeriod,
): FinanceCashSummary {
  const totals = calculateFinanceBalance(entries, period);
  const cardPendingCents = entries
    .filter(
      (entry) =>
        entry.status !== "cancelado" &&
        entry.type === "despesa" &&
        entry.cardSettlement === "pending" &&
        entry.competence >= period.from &&
        entry.competence <= period.to,
    )
    .reduce((total, entry) => total + cents(entry.amountCents), 0);
  return { ...totals, cardPendingCents };
}

export type FinancePageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/** Lê todas as páginas de uma consulta Supabase ordenada de forma estável. */
export async function loadFinanceRows<T>(
  buildPage: (range: { from: number; to: number }) => PromiseLike<FinancePageResult<T>>,
  pageSize = 1000,
): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new Error("Tamanho de página inválido.");
  }

  const rows: T[] = [];
  for (let page = 0; ; page += 1) {
    const result = await buildPage({
      from: page * pageSize,
      to: page * pageSize + pageSize - 1,
    });
    if (result.error) throw new Error(result.error.message);
    const pageRows = result.data || [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) return rows;
  }
}
