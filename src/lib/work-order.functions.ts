/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { financeCardTransactionMetadata } from "./finance-balance";

const PAYMENT_METHODS = new Set(["pix", "cartao", "dinheiro", "transferencia", "boleto", "outro"]);

export const completeWorkOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      workOrderId: string;
      amountCents: number;
      costCents?: number;
      costPaymentMethod?: string | null;
      paymentStatus: "paid" | "pending";
      paymentMethod?: string | null;
      finalNotes?: string;
    }) => {
      const companyId = String(input?.companyId || "").trim();
      const workOrderId = String(input?.workOrderId || "").trim();
      const amountCents = Number(input?.amountCents);
      const costCents = Number(input?.costCents || 0);
      const costPaymentMethod = input?.costPaymentMethod
        ? String(input.costPaymentMethod)
        : "outro";
      const paymentStatus = input?.paymentStatus === "pending" ? "pending" : "paid";
      const paymentMethod = input?.paymentMethod ? String(input.paymentMethod) : null;
      if (!companyId || !workOrderId) throw new Error("Ordem de serviço não informada.");
      if (!Number.isSafeInteger(amountCents) || amountCents < 0)
        throw new Error("Informe um valor válido.");
      if (!Number.isSafeInteger(costCents) || costCents < 0)
        throw new Error("Informe um custo válido.");
      if (costCents > 0 && !PAYMENT_METHODS.has(costPaymentMethod)) {
        throw new Error("Informe como esse custo foi pago.");
      }
      if (
        amountCents > 0 &&
        paymentStatus === "paid" &&
        (!paymentMethod || !PAYMENT_METHODS.has(paymentMethod))
      ) {
        throw new Error("Informe como o cliente pagou.");
      }
      return {
        companyId,
        workOrderId,
        amountCents,
        costCents,
        costPaymentMethod: costCents > 0 ? costPaymentMethod : null,
        paymentStatus,
        paymentMethod: amountCents > 0 && paymentStatus === "paid" ? paymentMethod : null,
        finalNotes: String(input?.finalNotes || "")
          .trim()
          .slice(0, 3000),
      };
    },
  )
  .handler(async ({ context, data }) => {
    const { requireCompanyMemberAccess } = await import("./company-admin-access.server");
    const access = await requireCompanyMemberAccess(
      context.supabase,
      context.userId,
      data.companyId,
    );
    const { assertCompanyOperational } = await import("./plan-limits.server");
    await assertCompanyOperational(data.companyId, { superAdminBypass: access.isSuperAdmin });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data: order, error: orderError } = await db
      .from("marcia_work_order")
      .select("id,number,status,summary,description,customer_id,marcia_customer(phone_e164)")
      .eq("company_id", data.companyId)
      .eq("id", data.workOrderId)
      .single();
    if (orderError) throw new Error(orderError.message);
    if (order.status === "completed") throw new Error(`A OS #${order.number} já está concluída.`);
    if (order.status === "cancelled") throw new Error("Uma OS cancelada não pode ser concluída.");

    const completedAt = new Date().toISOString();
    const description = [order.description, data.finalNotes ? `Fechamento: ${data.finalNotes}` : ""]
      .filter(Boolean)
      .join("\n\n");
    const { data: claimedOrder, error: updateError } = await db
      .from("marcia_work_order")
      .update({
        status: "completed",
        completed_at: completedAt,
        subtotal_cents: data.amountCents,
        total_cents: data.amountCents,
        description: description || null,
      })
      .eq("company_id", data.companyId)
      .eq("id", data.workOrderId)
      .eq("status", order.status)
      .select("id")
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!claimedOrder) {
      throw new Error("A OS foi alterada por outra pessoa. Atualize a tela e tente novamente.");
    }

    const { data: company, error: companyError } = await db
      .from("company")
      .select("financeiro_ativo")
      .eq("id", data.companyId)
      .single();
    if (companyError) throw new Error(companyError.message);
    let financeRecorded = false;
    if (company.financeiro_ativo && (data.amountCents > 0 || data.costCents > 0)) {
      const { error: seedError } = await db.rpc("seed_fin_categorias", {
        _company_id: data.companyId,
      });
      if (seedError) throw new Error(seedError.message);
      const today = completedAt.slice(0, 10);
      if (data.amountCents > 0) {
        const { data: category } = await db
          .from("fin_categoria")
          .select("id")
          .eq("company_id", data.companyId)
          .eq("tipo", "receita")
          .eq("nome", "Serviços")
          .maybeSingle();
        const values = {
          company_id: data.companyId,
          tipo: "receita",
          descricao: `OS #${order.number} · ${order.summary}`,
          valor_cents: data.amountCents,
          categoria_id: category?.id || null,
          forma_pagamento: data.paymentMethod,
          status: data.paymentStatus === "pending" ? "pendente" : "pago",
          vencimento: today,
          pago_em: data.paymentStatus === "paid" ? today : null,
          competencia: today,
          contato_numero: order.marcia_customer?.phone_e164 || null,
          work_order_id: order.id,
          created_by: context.userId,
        };
        const { data: existing, error: lookupError } = await db
          .from("fin_lancamento")
          .select("id")
          .eq("company_id", data.companyId)
          .eq("work_order_id", order.id)
          .eq("tipo", "receita")
          .limit(1)
          .maybeSingle();
        if (lookupError) throw new Error(lookupError.message);
        const financeResult = existing
          ? await db.from("fin_lancamento").update(values).eq("id", existing.id)
          : await db.from("fin_lancamento").insert(values);
        if (financeResult.error) throw new Error(financeResult.error.message);
        financeRecorded = true;
      }

      if (data.costCents > 0) {
        const cardSettlementPending = data.costPaymentMethod === "cartao";
        const { data: costCategory } = await db
          .from("fin_categoria")
          .select("id")
          .eq("company_id", data.companyId)
          .eq("tipo", "despesa")
          .eq("nome", "Operacional")
          .maybeSingle();
        const { error: costError } = await db.from("fin_lancamento").insert({
          company_id: data.companyId,
          tipo: "despesa",
          descricao: `Custo da OS #${order.number}`,
          valor_cents: data.costCents,
          categoria_id: costCategory?.id || null,
          forma_pagamento: data.costPaymentMethod || "outro",
          metadata: financeCardTransactionMetadata("despesa", data.costPaymentMethod),
          status: "pago",
          vencimento: today,
          pago_em: cardSettlementPending ? null : today,
          competencia: today,
          work_order_id: order.id,
          created_by: context.userId,
        });
        if (costError) throw new Error(costError.message);
        financeRecorded = true;
      }
    }

    return { completed: true, financeRecorded };
  });
