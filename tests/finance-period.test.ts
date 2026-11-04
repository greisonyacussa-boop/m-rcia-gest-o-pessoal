import { describe, expect, test } from "bun:test";
import {
  financeDayStatus,
  resolveFinancePeriod,
  sanitizeRange,
  summarizeFinanceDay,
  statusLabel,
} from "../src/lib/finance-period";

const today = new Date(2026, 9, 20); // 20/10/2026

describe("filtro de período da Visão do mês", () => {
  test("Este mês vai do dia 1 ao último dia do mês atual", () => {
    expect(resolveFinancePeriod("this_month", null, today)).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });
  test("Mês passado cobre o mês anterior inteiro", () => {
    expect(resolveFinancePeriod("last_month", null, today)).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });
  test("Últimos 30 dias inclui hoje e os 29 dias anteriores", () => {
    expect(resolveFinancePeriod("last_30", null, today)).toMatchObject({
      from: "2026-09-21",
      to: "2026-10-20",
    });
  });
  test("Personalizado usa as datas informadas, mesmo invertidas", () => {
    expect(
      resolveFinancePeriod("custom", { from: "2026-08-10", to: "2026-07-05" }, today),
    ).toMatchObject({ from: "2026-07-05", to: "2026-08-10" });
  });
  test("Datas inválidas são recusadas pelo servidor", () => {
    expect(sanitizeRange("2026-02-30", "2026-03-01")).toBeNull();
  });
});

describe("resumo do dia no calendário", () => {
  test("entrou e saiu só contam o que foi pago; pendentes viram compromissos", () => {
    expect(
      summarizeFinanceDay([
        { type: "receita", status: "pago", amountCents: 320000 },
        { type: "despesa", status: "pago", amountCents: 8490 },
        { type: "despesa", status: "pendente", amountCents: 15000 },
      ]),
    ).toEqual({
      incomeCents: 320000,
      expenseCents: 8490,
      cardExpenseCents: 0,
      cardPendingCount: 0,
      cardPendingCents: 0,
      netCents: 311510,
      pendingCount: 1,
      pendingCents: -15000,
    });
  });
  test("cartão pendente fica separado do caixa e não vence por causa da data", () => {
    expect(
      summarizeFinanceDay([
        { type: "despesa", status: "pago", amountCents: 22000, cardSettlement: "pending" },
        { type: "despesa", status: "pago", amountCents: 5000, cardSettlement: "paid" },
      ]),
    ).toMatchObject({
      expenseCents: 5000,
      cardExpenseCents: 22000,
      cardPendingCount: 1,
      cardPendingCents: 22000,
      netCents: -5000,
      pendingCount: 0,
    });
    expect(
      financeDayStatus(
        {
          type: "despesa",
          status: "pago",
          date: "2026-10-01",
          cardSettlement: "pending",
        },
        "2026-11-04",
      ),
    ).toBe("cartao_pendente");
  });
  test("conta pendente com data passada aparece como vencida", () => {
    expect(
      financeDayStatus({ type: "despesa", status: "pendente", date: "2026-10-01" }, "2026-10-20"),
    ).toBe("vencido");
    expect(
      financeDayStatus({ type: "receita", status: "pago", date: "2026-10-01" }, "2026-10-20"),
    ).toBe("recebido");
  });
  test("status de cartão depende apenas da confirmação explícita, nunca da data", () => {
    expect(statusLabel("despesa", "pago", "2026-01-10", "2026-10-20", "pending")).toBe(
      "Cartão a pagar",
    );
    expect(statusLabel("despesa", "pago", "2026-10-01", "2026-10-20", "paid")).toBe("Cartão pago");
  });
});
