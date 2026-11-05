import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  canonicalizeFinancePaymentMethod,
  detectExplicitFinancePaymentMethod,
  financePaymentMethodLabelFromText,
  financePaymentMethodQuestion,
  needsFinancePaymentMethod,
  resolveExplicitFinancePaymentMethod,
} from "../src/lib/finance-payment-method";

const financeCommandSource = readFileSync(
  new URL("../src/lib/finance-command.functions.ts", import.meta.url),
  "utf8",
);

describe("formas de pagamento da MárcIA", () => {
  test("canonicaliza variantes de cartão de crédito e Pix com ou sem acento", () => {
    expect(canonicalizeFinancePaymentMethod("cartão")).toBe("cartao");
    expect(canonicalizeFinancePaymentMethod("cartão de crédito")).toBe("cartao");
    expect(canonicalizeFinancePaymentMethod("cartao de credito")).toBe("cartao");
    expect(canonicalizeFinancePaymentMethod("crédito")).toBe("cartao");
    expect(canonicalizeFinancePaymentMethod("PIX")).toBe("pix");
  });

  test("texto explícito de cartão vence Pix inferido pela IA ou pelo rascunho anterior", () => {
    expect(
      resolveExplicitFinancePaymentMethod("Foi no cartão de crédito", [
        { role: "user", content: "Gastei R$ 80 no Pix" },
      ]),
    ).toBe("cartao");
    expect(
      resolveExplicitFinancePaymentMethod("cartao de credito", [
        { role: "user", content: "Gastei R$ 80" },
      ]),
    ).toBe("cartao");
    expect(detectExplicitFinancePaymentMethod("Não foi no Pix, foi no cartão de crédito")).toBe(
      "cartao",
    );
    expect(detectExplicitFinancePaymentMethod("Não foi Pix foi cartão de crédito")).toBe("cartao");
    expect(detectExplicitFinancePaymentMethod("Foi no Pix, não no cartão")).toBe("pix");
  });

  test("o comando IA usa a forma explicitamente informada antes de confirmar o lançamento", () => {
    expect(financeCommandSource).toContain(
      "resolveExplicitFinancePaymentMethod(data.message, command?.messages)",
    );
    expect(financeCommandSource).toContain("draft.paymentMethod = explicitPayment");
    expect(financeCommandSource).toContain("draft.missing = requiredFields(draft)");
  });

  test("débito, método desconhecido e contexto ambíguo não viram cartão nem Pix", () => {
    expect(canonicalizeFinancePaymentMethod("cartão de débito")).toBe("unknown");
    expect(canonicalizeFinancePaymentMethod("débito")).toBe("unknown");
    expect(detectExplicitFinancePaymentMethod("Paguei no cartão de débito")).toBe("unknown");
    expect(canonicalizeFinancePaymentMethod("vale")).toBe("unknown");
    expect(detectExplicitFinancePaymentMethod("paguei no Pix e no cartão")).toBe("unknown");
  });

  test("registro pago sem forma pergunta, mas conta a pagar não exige método", () => {
    expect(needsFinancePaymentMethod("record_expense", "paid", null)).toBe(true);
    expect(needsFinancePaymentMethod("record_income", null, null)).toBe(true);
    expect(needsFinancePaymentMethod("record_expense", "paid", "pix")).toBe(false);
    expect(needsFinancePaymentMethod("create_bill", "pending", null)).toBe(false);
    expect(financePaymentMethodQuestion()).toEqual({
      message: "Como essa movimentação foi paga?",
      quickReplies: ["Pix", "Cartão", "Dinheiro", "Transferência", "Boleto", "Outro"],
    });
  });

  test("sem método explícito a demonstração exibe não informada, nunca Pix", () => {
    expect(detectExplicitFinancePaymentMethod("Gastei R$ 40 no mercado")).toBeNull();
    expect(financePaymentMethodLabelFromText("Gastei R$ 40 no mercado")).toBe("Não informada");
    expect(financePaymentMethodLabelFromText("Paguei no cartão de débito")).toBe("Não informada");
  });
});
