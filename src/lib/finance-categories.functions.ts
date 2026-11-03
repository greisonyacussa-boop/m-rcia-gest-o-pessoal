/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadFinanceRows } from "./finance-balance";
import {
  financeCategoryDuplicateMessage,
  isFinanceCategoryDuplicate,
  validateFinanceCategoryInput,
  type FinanceCategoryCandidate,
  type FinanceCategoryInput,
  type FinanceCategoryType,
} from "./finance-category-rules";

export type FinanceCategory = {
  id: string;
  name: string;
  color: string;
  type: FinanceCategoryType;
};

function validateCreateInput(input: {
  companyId?: unknown;
  name?: unknown;
  type?: unknown;
  color?: unknown;
}): FinanceCategoryInput {
  return validateFinanceCategoryInput(input);
}

export const createFinanceCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateCreateInput)
  .handler(async ({ context, data }): Promise<FinanceCategory> => {
    const { requireCompanyAdminAccess } = await import("./company-admin-access.server");
    const access = await requireCompanyAdminAccess(
      context.supabase,
      context.userId,
      data.companyId,
    );
    const { assertCompanyOperational } = await import("./plan-limits.server");
    await assertCompanyOperational(data.companyId, { superAdminBypass: access.isSuperAdmin });

    // A checagem de papel acima precede toda leitura/escrita com o cliente de serviço.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const existing = await loadFinanceRows<FinanceCategoryCandidate>(({ from, to }) =>
      db
        .from("fin_categoria")
        .select("id,nome,tipo,cor,company_id")
        .eq("company_id", data.companyId)
        .eq("tipo", data.type)
        .order("id")
        .range(from, to),
    );
    if (isFinanceCategoryDuplicate(existing, data)) {
      throw new Error(financeCategoryDuplicateMessage(data.type));
    }

    const { data: row, error } = await db
      .from("fin_categoria")
      .insert({
        company_id: data.companyId,
        nome: data.name,
        tipo: data.type,
        cor: data.color,
        ativo: true,
      })
      .select("id,nome,tipo,cor")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error(financeCategoryDuplicateMessage(data.type));
      throw new Error(error.message);
    }

    return {
      id: row.id,
      name: row.nome,
      color: row.cor,
      type: row.tipo,
    };
  });
