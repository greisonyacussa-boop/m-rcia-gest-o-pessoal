import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  buildDemoCardLedger,
  buildDemoTransactions,
  settleDemoCardLedger,
} from "../src/lib/finance-demo-data";

const serverLedger = readFileSync(
  new URL("../src/lib/finance-card-payment.functions.ts", import.meta.url),
  "utf8",
);
const cardPage = readFileSync(
  new URL("../src/components/finance/finance-card-overview.tsx", import.meta.url),
  "utf8",
);
const paymentBatchMigration = readFileSync(
  new URL("../supabase/migrations/20261105005300_add_card_payment_batches.sql", import.meta.url),
  "utf8",
);

describe("histórico cumulativo do cartão", () => {
  test("consulta compras de todas as competências e conserva lotes de pagamento e categorias", () => {
    const ledgerHandler = serverLedger.slice(
      serverLedger.indexOf("export const getFinanceCardLedger"),
    );
    expect(ledgerHandler).toContain('.eq("forma_pagamento", "cartao")');
    expect(ledgerHandler).not.toMatch(/\.gte\("competencia"/);
    expect(ledgerHandler).toContain("card_payment_batch_id");
    expect(cardPage).toContain("buildPaymentGroups");
    expect(cardPage).toContain("categoryTotals(groupItems)");
    expect(cardPage).toContain("Histórico antigo sem baixa vinculada");
    expect(ledgerHandler).toContain("allPaymentExpenseRows");
    expect(ledgerHandler).toContain('.eq("status", "pago")');
    const allPaymentQueryStart = ledgerHandler.indexOf(
      "loadFinanceRows<any>",
      ledgerHandler.indexOf("loadFinanceRows<any>") + 1,
    );
    const allPaymentQueryEnd = ledgerHandler.indexOf('db.from("fin_categoria")');
    const allPaymentQuery = ledgerHandler.slice(allPaymentQueryStart, allPaymentQueryEnd);
    expect(allPaymentQuery).not.toContain("forma_pagamento");
    expect(cardPage).toContain('useState<CategoryScope>("allPayments")');
    expect(cardPage).toContain("data.allPaymentExpenseCategories");
    expect(paymentBatchMigration).toContain("'card_payment_batch_id', v_batch_id");
    expect(paymentBatchMigration).toContain("GRANT EXECUTE");
  });

  test("mantém gastos fictícios de vários meses no mesmo acumulado até a quitação", () => {
    const ledger = buildDemoCardLedger(new Date("2026-11-04T12:00:00"));
    const months = new Set(ledger.items.map((item) => item.date.slice(0, 7)));
    const sumPending = ledger.items
      .filter((item) => item.settlement === "pending")
      .reduce((total, item) => total + item.amountCents, 0);

    expect(months.size).toBeGreaterThan(1);
    expect(ledger.pendingCount).toBeGreaterThan(1);
    expect(ledger.pendingTotalCents).toBe(sumPending);
    expect(ledger.items.every((item) => item.categoryName.length > 0)).toBe(true);
  });

  test("soma despesas realizadas por categoria usando todos os meios de pagamento", () => {
    const today = new Date("2026-11-04T12:00:00");
    const ledger = buildDemoCardLedger(today);
    const realizedExpenses = buildDemoTransactions(today).filter(
      (transaction) => transaction.type === "despesa" && transaction.status === "pago",
    );
    const expectedTotal = realizedExpenses.reduce((total, item) => total + item.amountCents, 0);
    const methods = new Set(realizedExpenses.map((item) => item.paymentMethod));
    const categoryTotal = ledger.allPaymentExpenseCategories.reduce(
      (total, item) => total + item.amountCents,
      0,
    );

    expect(methods.size).toBeGreaterThan(1);
    expect(ledger.allPaymentExpenseTotalCents).toBe(expectedTotal);
    expect(categoryTotal).toBe(expectedTotal);
    expect(ledger.allPaymentExpenseCount).toBe(realizedExpenses.length);
    expect(ledger.allPaymentExpenseCategories.length).toBeGreaterThan(1);
  });

  test("simular pagamento zera apenas o pendente e preserva cada compra com categoria e data", () => {
    const ledger = buildDemoCardLedger(new Date("2026-11-04T12:00:00"));
    const paid = settleDemoCardLedger(
      ledger,
      "demo-payment-1",
      "2026-11-04",
      "Conta de demonstração",
    );
    const paidItems = paid.items.filter((item) => item.settlement === "paid");

    expect(paid.pendingTotalCents).toBe(0);
    expect(paid.pendingCount).toBe(0);
    expect(paid.settledTotalCents).toBe(ledger.settledTotalCents + ledger.pendingTotalCents);
    expect(paidItems.length).toBe(ledger.pendingCount);
    expect(paidItems.every((item) => item.paymentDate === "2026-11-04")).toBe(true);
    expect(paidItems.every((item) => item.paymentBatchId === "demo-payment-1")).toBe(true);
    expect(paidItems.map((item) => item.categoryName)).toEqual(
      ledger.items.filter((item) => item.settlement === "pending").map((item) => item.categoryName),
    );
  });
});
