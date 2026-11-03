import { describe, expect, test } from "bun:test";
import {
  calculateFinanceBalance,
  loadFinanceRows,
  type FinanceBalanceEntry,
} from "../src/lib/finance-balance";

const entry = (
  competence: string,
  type: "receita" | "despesa",
  amountCents: number,
  status = "pago",
): FinanceBalanceEntry => ({ type, amountCents, status, competence });

describe("saldo disponível por competência", () => {
  test("carrega o saldo realizado de meses consecutivos", () => {
    const entries = [
      entry("2026-01-31", "receita", 10000),
      entry("2026-02-10", "despesa", 4000),
      entry("2026-02-20", "receita", 2500),
      entry("2026-03-05", "despesa", 1000),
    ];
    expect(
      calculateFinanceBalance(entries, { from: "2026-02-01", to: "2026-02-28" }),
    ).toMatchObject({
      openingBalanceCents: 10000,
      netCents: -1500,
      availableCents: 8500,
    });
    expect(
      calculateFinanceBalance(entries, { from: "2026-03-01", to: "2026-03-31" }),
    ).toMatchObject({
      openingBalanceCents: 8500,
      netCents: -1000,
      availableCents: 7500,
    });
  });

  test("mês vazio conserva a abertura sem criar movimento", () => {
    expect(
      calculateFinanceBalance([entry("2026-01-15", "receita", 12000)], {
        from: "2026-02-01",
        to: "2026-02-28",
      }),
    ).toEqual({
      openingBalanceCents: 12000,
      receivedCents: 0,
      spentCents: 0,
      netCents: 0,
      availableCents: 12000,
      pendingIncomeCents: 0,
      pendingExpenseCents: 0,
      leftoverCents: 12000,
    });
  });

  test("preserva saldo negativo e cruza a virada do ano", () => {
    const entries = [
      entry("2025-12-31", "despesa", 15000),
      entry("2026-01-01", "receita", 5000),
      entry("2026-01-31", "despesa", 2000),
    ];
    expect(
      calculateFinanceBalance(entries, { from: "2026-01-01", to: "2026-01-31" }),
    ).toMatchObject({
      openingBalanceCents: -15000,
      netCents: 3000,
      availableCents: -12000,
      leftoverCents: -12000,
    });
  });

  test("inclui as duas fronteiras e ignora o que está fora", () => {
    const totals = calculateFinanceBalance(
      [
        entry("2026-05-09", "receita", 1000),
        entry("2026-05-10", "receita", 2000),
        entry("2026-06-20", "despesa", 500),
        entry("2026-06-21", "despesa", 700),
      ],
      { from: "2026-05-10", to: "2026-06-20" },
    );
    expect(totals).toMatchObject({
      openingBalanceCents: 1000,
      receivedCents: 2000,
      spentCents: 500,
      netCents: 1500,
      availableCents: 2500,
    });
  });

  test("pendentes e cancelados não rolam nem alteram o disponível", () => {
    const totals = calculateFinanceBalance(
      [
        entry("2026-01-01", "receita", 10000, "pendente"),
        entry("2026-01-02", "despesa", 9000, "cancelado"),
        entry("2026-02-01", "receita", 3000, "pendente"),
        entry("2026-02-02", "despesa", 1000, "atrasado"),
        entry("2026-02-03", "receita", 7000, "cancelado"),
      ],
      { from: "2026-02-01", to: "2026-02-28" },
    );
    expect(totals).toEqual({
      openingBalanceCents: 0,
      receivedCents: 0,
      spentCents: 0,
      netCents: 0,
      availableCents: 0,
      pendingIncomeCents: 3000,
      pendingExpenseCents: 1000,
      leftoverCents: 2000,
    });
  });

  test("o acumulado não duplica as entradas do período", () => {
    const totals = calculateFinanceBalance(
      [entry("2026-01-31", "receita", 10000), entry("2026-02-01", "receita", 5000)],
      { from: "2026-02-01", to: "2026-02-28" },
    );
    expect(totals.openingBalanceCents).toBe(10000);
    expect(totals.netCents).toBe(5000);
    expect(totals.availableCents).toBe(15000);
  });
});

describe("loader paginado de lançamentos", () => {
  test("lê todas as páginas de uma consulta com mais de 1.000 linhas", async () => {
    const source = Array.from({ length: 2001 }, (_, id) => id);
    const ranges: Array<{ from: number; to: number }> = [];
    const rows = await loadFinanceRows(async (range) => {
      ranges.push(range);
      return { data: source.slice(range.from, range.to + 1), error: null };
    });
    expect(rows).toEqual(source);
    expect(ranges).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
      { from: 2000, to: 2999 },
    ]);
  });

  test("propaga erro da consulta em vez de transformar falha em saldo zero", async () => {
    await expect(
      loadFinanceRows(async () => ({ data: null, error: { message: "falha do banco" } })),
    ).rejects.toThrow("falha do banco");
  });
});
