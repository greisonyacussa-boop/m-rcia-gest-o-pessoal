export type FinanceBalanceEntry = {
  type: "receita" | "despesa";
  status: string;
  amountCents: number;
  competence: string;
};

export type FinanceBalancePeriod = {
  from: string;
  to: string;
};

export type FinanceBalanceTotals = {
  openingBalanceCents: number;
  receivedCents: number;
  spentCents: number;
  netCents: number;
  availableCents: number;
  pendingIncomeCents: number;
  pendingExpenseCents: number;
  leftoverCents: number;
};

const cents = (value: number) => (Number.isFinite(value) ? value : 0);

export function isFinancePendingStatus(status: string) {
  return status === "pendente" || status === "atrasado";
}

function sum(entries: FinanceBalanceEntry[], predicate: (entry: FinanceBalanceEntry) => boolean) {
  return entries.filter(predicate).reduce((total, entry) => total + cents(entry.amountCents), 0);
}

/**
 * Deriva o saldo disponível sem persistir snapshots: o realizado anterior ao
 * período abre o intervalo, e o realizado do intervalo compõe seu movimento.
 */
export function calculateFinanceBalance(
  entries: readonly FinanceBalanceEntry[],
  period: FinanceBalancePeriod,
): FinanceBalanceTotals {
  const activeEntries = entries.filter((entry) => entry.status !== "cancelado");
  const openingBalanceCents = activeEntries
    .filter((entry) => entry.status === "pago" && entry.competence < period.from)
    .reduce(
      (total, entry) =>
        total + (entry.type === "receita" ? cents(entry.amountCents) : -cents(entry.amountCents)),
      0,
    );
  const periodEntries = activeEntries.filter(
    (entry) => entry.competence >= period.from && entry.competence <= period.to,
  );
  const receivedCents = sum(
    periodEntries,
    (entry) => entry.type === "receita" && entry.status === "pago",
  );
  const spentCents = sum(
    periodEntries,
    (entry) => entry.type === "despesa" && entry.status === "pago",
  );
  const pendingIncomeCents = sum(
    periodEntries,
    (entry) => entry.type === "receita" && isFinancePendingStatus(entry.status),
  );
  const pendingExpenseCents = sum(
    periodEntries,
    (entry) => entry.type === "despesa" && isFinancePendingStatus(entry.status),
  );
  const netCents = receivedCents - spentCents;
  const availableCents = openingBalanceCents + netCents;

  return {
    openingBalanceCents,
    receivedCents,
    spentCents,
    netCents,
    availableCents,
    pendingIncomeCents,
    pendingExpenseCents,
    leftoverCents: availableCents + pendingIncomeCents - pendingExpenseCents,
  };
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
