import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  INVESTMENT_TYPES,
  MAX_INVESTMENT_CENTS,
  MAX_INVESTMENTS_PER_COMPANY,
  MAX_PATRIMONY_TARGET_CENTS,
  type InvestmentType,
} from "./investment-types";

const COMPANY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVESTMENT_COLUMNS =
  "id,company_id,nome,tipo,instituicao,valor_atual_cents,created_at,updated_at";

type InvestmentDbRow = Database["public"]["Tables"]["fin_investimento"]["Row"];

export type InvestmentRecord = {
  id: string;
  name: string;
  type: InvestmentType;
  institution: string | null;
  valueCents: number;
  createdAt: string;
  updatedAt: string;
};

export type InvestmentPortfolio = {
  targetCents: number;
  investments: InvestmentRecord[];
};

function parseCompanyId(value: unknown): string {
  const companyId = String(value || "").trim();
  if (!COMPANY_ID_PATTERN.test(companyId)) throw new Error("Conta financeira inválida.");
  return companyId;
}

function parseCents(value: unknown, maxCents: number): number {
  const cents = Number(value);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > maxCents) {
    throw new Error("Informe um valor válido dentro do limite permitido.");
  }
  return cents;
}

async function authorizeCompany(supabase: unknown, userId: string, companyId: string) {
  const { requireCompanyMemberAccess } = await import("./company-admin-access.server");
  const access = await requireCompanyMemberAccess(supabase, userId, companyId);
  const { assertCompanyOperational } = await import("./plan-limits.server");
  await assertCompanyOperational(companyId, { superAdminBypass: access.isSuperAdmin });
}

function mapInvestment(row: InvestmentDbRow): InvestmentRecord {
  return {
    id: row.id,
    name: row.nome,
    type: row.tipo as InvestmentType,
    institution: row.instituicao,
    valueCents: Number(row.valor_atual_cents || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const getInvestmentPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: parseCompanyId(input?.companyId),
  }))
  .handler(async ({ context, data }): Promise<InvestmentPortfolio> => {
    await authorizeCompany(context.supabase, context.userId, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [investmentsResult, goalResult] = await Promise.all([
      supabaseAdmin
        .from("fin_investimento")
        .select(INVESTMENT_COLUMNS, { count: "exact" })
        .eq("company_id", data.companyId)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(MAX_INVESTMENTS_PER_COMPANY),
      supabaseAdmin
        .from("fin_patrimonio_meta")
        .select("objetivo_cents")
        .eq("company_id", data.companyId)
        .maybeSingle(),
    ]);
    if (investmentsResult.error) throw new Error(investmentsResult.error.message);
    if (goalResult.error) throw new Error(goalResult.error.message);
    if ((investmentsResult.count ?? 0) > MAX_INVESTMENTS_PER_COMPANY) {
      throw new Error(
        "Há mais registros que o limite da tela. Fale com o suporte para revisar sua conta.",
      );
    }
    return {
      targetCents: Number(goalResult.data?.objetivo_cents || 0),
      investments: (investmentsResult.data || []).map(mapInvestment),
    };
  });

export const saveInvestment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      investmentId?: string | null;
      name: string;
      type: InvestmentType;
      institution?: string | null;
      valueCents: number;
    }) => {
      const companyId = parseCompanyId(input?.companyId);
      const investmentId = input?.investmentId ? String(input.investmentId).trim() : null;
      if (investmentId && !COMPANY_ID_PATTERN.test(investmentId)) {
        throw new Error("Investimento inválido.");
      }
      const name = String(input?.name || "").trim();
      if (!name || name.length > 100) throw new Error("Informe o nome do investimento.");
      const type = String(input?.type || "") as InvestmentType;
      if (!(INVESTMENT_TYPES as readonly string[]).includes(type)) {
        throw new Error("Escolha um tipo de investimento válido.");
      }
      const institution = String(input?.institution || "").trim() || null;
      if (institution && institution.length > 120) {
        throw new Error("O nome da instituição deve ter até 120 caracteres.");
      }
      return {
        companyId,
        investmentId,
        name,
        type,
        institution,
        valueCents: parseCents(input?.valueCents, MAX_INVESTMENT_CENTS),
      };
    },
  )
  .handler(async ({ context, data }): Promise<InvestmentRecord> => {
    await authorizeCompany(context.supabase, context.userId, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!data.investmentId) {
      const { count, error: countError } = await supabaseAdmin
        .from("fin_investimento")
        .select("id", { count: "exact", head: true })
        .eq("company_id", data.companyId);
      if (countError) throw new Error(countError.message);
      if ((count ?? 0) >= MAX_INVESTMENTS_PER_COMPANY) {
        throw new Error("Esta conta já atingiu o limite de 1.000 investimentos cadastrados.");
      }
    }

    const values = {
      nome: data.name,
      tipo: data.type,
      instituicao: data.institution,
      valor_atual_cents: data.valueCents,
      updated_at: new Date().toISOString(),
    };
    const result = data.investmentId
      ? await supabaseAdmin
          .from("fin_investimento")
          .update(values)
          .eq("company_id", data.companyId)
          .eq("id", data.investmentId)
          .select(INVESTMENT_COLUMNS)
          .maybeSingle()
      : await supabaseAdmin
          .from("fin_investimento")
          .insert({ company_id: data.companyId, ...values })
          .select(INVESTMENT_COLUMNS)
          .single();
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error("Esse investimento não foi encontrado nesta conta.");
    return mapInvestment(result.data);
  });

export const removeInvestment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; investmentId: string }) => {
    const companyId = parseCompanyId(input?.companyId);
    const investmentId = String(input?.investmentId || "").trim();
    if (!COMPANY_ID_PATTERN.test(investmentId)) throw new Error("Investimento inválido.");
    return { companyId, investmentId };
  })
  .handler(async ({ context, data }) => {
    await authorizeCompany(context.supabase, context.userId, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: removed, error } = await supabaseAdmin
      .from("fin_investimento")
      .delete()
      .eq("company_id", data.companyId)
      .eq("id", data.investmentId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!removed) throw new Error("Esse investimento não foi encontrado nesta conta.");
    return { ok: true as const };
  });

export const savePatrimonyGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; targetCents: number }) => ({
    companyId: parseCompanyId(input?.companyId),
    targetCents: parseCents(input?.targetCents, MAX_PATRIMONY_TARGET_CENTS),
  }))
  .handler(async ({ context, data }) => {
    await authorizeCompany(context.supabase, context.userId, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("fin_patrimonio_meta").upsert(
      {
        company_id: data.companyId,
        objetivo_cents: data.targetCents,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );
    if (error) throw new Error(error.message);
    return { targetCents: data.targetCents };
  });
