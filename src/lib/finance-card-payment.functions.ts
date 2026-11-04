/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FinanceCardPaymentResult = {
  paidCount: number;
  paidCents: number;
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
    const { requireCompanyMemberAccess } = await import("./company-admin-access.server");
    const access = await requireCompanyMemberAccess(
      context.supabase,
      context.userId,
      data.companyId,
    );
    const { assertCompanyOperational } = await import("./plan-limits.server");
    await assertCompanyOperational(data.companyId, { superAdminBypass: access.isSuperAdmin });

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
