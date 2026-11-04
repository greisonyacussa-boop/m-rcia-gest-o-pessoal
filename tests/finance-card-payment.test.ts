import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20261104221500_add_explicit_card_payment.sql", import.meta.url),
  "utf8",
);
const paymentServerFn = readFileSync(
  new URL("../src/lib/finance-card-payment.functions.ts", import.meta.url),
  "utf8",
);
const dashboardFunctions = readFileSync(
  new URL("../src/lib/finance-dashboard.functions.ts", import.meta.url),
  "utf8",
);
const balanceVerifier = readFileSync(
  new URL("../scripts/verify-finance-rebuild.mjs", import.meta.url),
  "utf8",
);
const transactionsView = readFileSync(
  new URL("../src/components/finance/transactions-view.tsx", import.meta.url),
  "utf8",
);
const plannerView = readFileSync(
  new URL("../src/components/finance/planner-view.tsx", import.meta.url),
  "utf8",
);
const workOrderDialog = readFileSync(
  new URL("../src/components/marcia/complete-work-order-dialog.tsx", import.meta.url),
  "utf8",
);
const dashboardHook = readFileSync(
  new URL("../src/hooks/use-finance-dashboard.ts", import.meta.url),
  "utf8",
);
const plannerRoute = readFileSync(
  new URL("../src/routes/app/planejamento.tsx", import.meta.url),
  "utf8",
);
const cardWriters = [
  "../src/lib/finance-command.functions.ts",
  "../src/lib/finance-whatsapp.server.ts",
  "../src/lib/marcia-command.functions.ts",
  "../src/lib/work-order.functions.ts",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
const summaryWriters = cardWriters.slice(0, 3);
const marciaCommand = cardWriters[2];
const workOrderWriter = cardWriters[3];

describe("quitação manual do cartão", () => {
  test("a operação exige gastos explicitamente pendentes e uma conta ativa da mesma empresa", () => {
    expect(migration).toMatch(/metadata->>'card_settlement'\s*=\s*'pending'/i);
    expect(migration).toMatch(/company_id\s*=\s*_company_id/i);
    expect(migration).toMatch(/ativo\s*=\s*true/i);
    expect(migration).toMatch(/PERFORM 1[\s\S]*ativo = true[\s\S]*FOR UPDATE;[\s\S]*IF NOT FOUND/i);
    expect(migration).toMatch(/FOR UPDATE/i);
    expect(migration).toMatch(/card_settlement',\s*'paid'/i);
  });

  test("nenhuma data de vencimento ou limite aciona a baixa", () => {
    expect(migration).not.toMatch(/limite_cents|vencimento_dia|vencimento_em|fechamento_em/i);
    expect(paymentServerFn).toContain("mark_pending_finance_card_charges_paid");
  });

  test("atualiza saldo da conta e quitação na mesma operação atômica", () => {
    expect(migration).toMatch(/conta_id\s*=\s*_account_id/i);
    expect(migration).toMatch(/pago_em\s*=\s*v_paid_at/i);
    expect(balanceVerifier).toMatch(/UPDATE OF conta_id, status, tipo, valor_cents OR DELETE/i);
    expect(balanceVerifier).toContain("saldo_cents = saldo_cents \\+ _new_delta");
    expect(migration).toMatch(/GRANT EXECUTE[\s\S]*TO service_role/i);
  });

  test("repetir a confirmação sem gastos pendentes não debita a conta de novo", () => {
    expect(migration).toMatch(
      /IF v_paid_count = 0 THEN[\s\S]*RETURN QUERY SELECT 0::bigint, 0::bigint;[\s\S]*RETURN;/i,
    );
  });

  test("edição e cancelamento concorrentes não reabrem um cartão já liquidado", () => {
    expect(dashboardFunctions).toMatch(
      /cardSettlement === "pending"[\s\S]*data\.type !== "despesa"[\s\S]*data\.paymentMethod !== "cartao"/,
    );
    expect(dashboardFunctions).toContain('updateQuery.eq("metadata->>card_settlement", "pending")');
    expect(dashboardFunctions).toContain('cancelQuery.eq("metadata->>card_settlement", "pending")');
  });

  test("chat, WhatsApp, extrato e planner separam cartão pendente do caixa", () => {
    for (const writer of summaryWriters) {
      expect(writer).toContain("summarizeFinanceCash");
      expect(writer).toContain("financeCashSummaryRange");
    }
    expect(transactionsView).toContain("Gastos registrados");
    expect(transactionsView).toContain("Cartão a pagar");
    expect(plannerView).toContain("cardPendingCents");
    expect(plannerView).toContain('label: "Cartão a pagar"');
  });

  test("custo de OS tem forma própria e cartão não herda a forma de pagamento do cliente", () => {
    expect(workOrderDialog).toContain("Como esse custo foi pago?");
    expect(workOrderDialog).toContain("costPaymentMethod");
    expect(workOrderWriter).toContain("data.costPaymentMethod");
    expect(workOrderWriter).toContain(
      'financeCardTransactionMetadata("despesa", data.costPaymentMethod)',
    );
    expect(workOrderWriter).toContain('.eq("status", order.status)');
  });

  test("comando da MárcIA pergunta a forma do custo e protege OS concluída ou cancelada", () => {
    expect(marciaCommand).toContain('missing.push("cost_payment_method")');
    expect(marciaCommand).toContain("Como você pagou esse custo da OS?");
    expect(marciaCommand).toContain('"costPaymentMethod": null');
    expect(marciaCommand).toContain("paymentMethod: draft.costPaymentMethod");
    expect(marciaCommand).toContain("RASCUNHO ANTERIOR.missing");
    expect(marciaCommand).toContain('.eq("status", order.status)');
    expect(marciaCommand).toContain('order.status === "cancelled"');
  });

  test("custo de OS é registrado mesmo quando o valor da receita é zero", () => {
    expect(workOrderWriter).toContain(
      "if (company.financeiro_ativo && (data.amountCents > 0 || data.costCents > 0))",
    );
    expect(marciaCommand).toContain("if ((draft.costCents || 0) > 0)");
    expect(marciaCommand).toContain("value === null");
    expect(marciaCommand).toContain("next.amountCents === null");
    expect(marciaCommand).toContain('if (draft.amountCents == null) missing.push("amount")');
  });

  test("dashboard e calendário ignoram respostas antigas ao trocar o período", () => {
    expect(dashboardHook).toContain("requestSequence.current === requestId");
    expect(plannerRoute).toContain("requestSequence.current === requestId");
  });

  test("a interface calcula apenas o total pendente e exige autorização server-side", () => {
    expect(dashboardFunctions).toContain('.eq("metadata->>card_settlement", "pending")');
    expect(paymentServerFn).toContain("requireCompanyMemberAccess");
    expect(paymentServerFn).toContain("assertCompanyOperational");
    expect(dashboardFunctions).toMatch(/accountId:\s*cardSettlementPending\s*\?\s*null/);
    for (const writer of cardWriters) {
      expect(writer).toContain("financeCardTransactionMetadata");
    }
  });
});
