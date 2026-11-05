/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadFinanceRows, readFinanceCardSettlement } from "./finance-balance";

export type FinanceCardPaymentResult = {
  paidCount: number;
  paidCents: number;
};

export type FinanceCardLedgerItem = {
  id: string;
  date: string;
  amountCents: number;
  description: string;
  categoryId: string | null;
  categoryName: string;
  categoryColor: string;
  cardName: string | null;
  settlement: "pending" | "paid" | "legacy";
  paymentDate: string | null;
  paymentAccountName: string | null;
  paymentBatchId: string | null;
};

export type FinanceCardLedger = {
  items: FinanceCardLedgerItem[];
  accounts: Array<{ id: string; name: string }>;
  pendingTotalCents: number;
  pendingCount: number;
  settledTotalCents: number;
  legacyCount: number;
};

async function authorizeFinanceCardAccess(context: any, companyId: string) {
  const { requireCompanyMemberAccess } = await import("./company-admin-access.server");
  const access = await requireCompanyMemberAccess(context.supabase, context.userId, companyId);
  const { assertCompanyOperational } = await import("./plan-limits.server");
  await assertCompanyOperational(companyId, { superAdminBypass: access.isSuperAdmin });
}

const cents = (value: unknown) => Number(value || 0);
const isoDate = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const result = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null;
};

export const markFinanceCardPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; accountId: string }) => {
    const companyId = String(input?.companyId || "").trim();
    const accountId = String(input?.accountId || "").trim();
    if (!companyId) throw new Error("Conta não informada.");
    if (!accountId) throw new Error("Escolha a conta de onde saiu o pagamento.");
    return { companyId, accountId };
  })
  .handler(async ({ context, data }): Promise<FinanceCardPaymentResult> => {
    await authorizeFinanceCardAccess(context, data.companyId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await (supabaseAdmin as any).rpc(
      "mark_pending_finance_card_charges_paid",
      { _company_id: data.companyId, _account_id: data.accountId },
    );
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    const paidCount = Number(row?.paid_count || 0);
    const paidCents = Number(row?.paid_cents || 0);
    if (!Number.isSafeInteger(paidCount) || paidCount < 0) {
      throw new Error("A confirmação do pagamento retornou uma quantidade inválida.");
    }
    if (!Number.isSafeInteger(paidCents) || paidCents < 0) {
      throw new Error("A confirmação do pagamento retornou um valor inválido.");
    }
    return { paidCount, paidCents };
  });

/** Leitura all-time: compras pendentes antigas continuam no total até a quitação explícita. */
export const getFinanceCardLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => {
    const companyId = String(input?.companyId || "").trim();
    if (!companyId) throw new Error("Conta não informada.");
    return { companyId };
  })
  .handler(async ({ context, data }): Promise<FinanceCardLedger> => {
    await authorizeFinanceCardAccess(context, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [rows, categories, accounts, cards] = await Promise.all([
      loadFinanceRows<any>(({ from, to }) =>
        db
          .from("fin_lancamento")
          .select(
            "id,descricao,valor_cents,competencia,ocorrido_em,pago_em,categoria_id,conta_id,cartao_id,metadata,status,created_at",
          )
          .eq("company_id", data.companyId)
          .eq("tipo", "despesa")
          .eq("forma_pagamento", "cartao")
          .neq("status", "cancelado")
          .order("competencia", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      ),
      db.from("fin_categoria").select("id,nome,cor").eq("company_id", data.companyId),
      db.from("fin_conta").select("id,nome,ativo").eq("company_id", data.companyId),
      db.from("fin_cartao").select("id,nome,ultimos_quatro").eq("company_id", data.companyId),
    ]);
    const failed = [categories, accounts, cards].find((result) => result.error)?.error;
    if (failed) throw new Error(failed.message);

    const categoryById = new Map((categories.data || []).map((row: any) => [row.id, row] as const));
    const accountById = new Map((accounts.data || []).map((row: any) => [row.id, row] as const));
    const cardById = new Map((cards.data || []).map((row: any) => [row.id, row] as const));
    const items: FinanceCardLedgerItem[] = rows.map((row: any) => {
      const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
      const category = categoryById.get(row.categoria_id) as any;
      const card = cardById.get(row.cartao_id) as any;
      const settlement = readFinanceCardSettlement(row.metadata) || "legacy";
      const paymentDate =
        settlement === "paid" ? isoDate(metadata.card_paid_at) || isoDate(row.pago_em) : null;
      const paymentAccountId = metadata.card_paid_account_id || row.conta_id || null;
      const paymentAccount = paymentAccountId ? (accountById.get(paymentAccountId) as any) : null;
      const recordedBatchId =
        typeof metadata.card_payment_batch_id === "string" ? metadata.card_payment_batch_id : null;
      const paymentBatchId =
        settlement !== "paid"
          ? null
          : recordedBatchId ||
            (paymentDate
              ? `legacy-${paymentDate}-${paymentAccountId || "unknown"}`
              : `legacy-${row.id}`);
      const date = isoDate(row.competencia) || isoDate(row.ocorrido_em) || "";
      return {
        id: String(row.id),
        date,
        amountCents: cents(row.valor_cents),
        description: String(row.descricao || "Gasto no cartão"),
        categoryId: row.categoria_id || null,
        categoryName: category?.nome || "Sem categoria",
        categoryColor: category?.cor || "#94A3B8",
        cardName: card
          ? `${card.nome}${card.ultimos_quatro ? ` •${card.ultimos_quatro}` : ""}`
          : null,
        settlement,
        paymentDate,
        paymentAccountName: settlement === "paid" ? paymentAccount?.nome || null : null,
        paymentBatchId,
      };
    });
    const pendingItems = items.filter((item) => item.settlement === "pending");
    const settledItems = items.filter((item) => item.settlement === "paid");
    return {
      items,
      accounts: (accounts.data || [])
        .filter((account: any) => account.ativo)
        .map((account: any) => ({ id: account.id, name: account.nome }))
        .sort((first: any, second: any) => first.name.localeCompare(second.name, "pt-BR")),
      pendingTotalCents: pendingItems.reduce((total, item) => total + item.amountCents, 0),
      pendingCount: pendingItems.length,
      settledTotalCents: settledItems.reduce((total, item) => total + item.amountCents, 0),
      legacyCount: items.filter((item) => item.settlement === "legacy").length,
    };
  });
