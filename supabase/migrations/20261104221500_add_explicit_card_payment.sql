-- A baixa só ocorre pela ação explícita do usuário. O marcador não depende de limite,
-- fechamento, vencimento ou passagem do tempo; as linhas antigas sem esse marcador ficam intactas.
CREATE OR REPLACE FUNCTION public.mark_pending_finance_card_charges_paid(
  _company_id uuid,
  _account_id uuid
)
RETURNS TABLE(paid_count bigint, paid_cents bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid_count bigint;
  v_paid_cents bigint;
  v_paid_at date := (timezone('America/Sao_Paulo', now()))::date;
BEGIN
  PERFORM 1
    FROM public.fin_conta
    WHERE id = _account_id
      AND company_id = _company_id
      AND ativo = true
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta financeira inválida ou inativa.';
  END IF;

  WITH eligible AS MATERIALIZED (
    SELECT id
    FROM public.fin_lancamento
    WHERE company_id = _company_id
      AND tipo = 'despesa'
      AND forma_pagamento = 'cartao'
      AND status <> 'cancelado'
      AND metadata->>'card_settlement' = 'pending'
    ORDER BY created_at, id
    FOR UPDATE
  ), settled AS (
    UPDATE public.fin_lancamento AS charge
    SET metadata = COALESCE(charge.metadata, '{}'::jsonb) || jsonb_build_object(
          'card_settlement', 'paid',
          'card_paid_account_id', _account_id,
          'card_paid_at', v_paid_at::text
        ),
        conta_id = _account_id,
        status = 'pago',
        pago_em = v_paid_at,
        updated_at = now()
    FROM eligible
    WHERE charge.id = eligible.id
      AND charge.company_id = _company_id
    RETURNING charge.valor_cents
  )
  SELECT COUNT(*)::bigint, COALESCE(SUM(valor_cents), 0)::bigint
  INTO v_paid_count, v_paid_cents
  FROM settled;

  IF v_paid_count = 0 THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint;
    RETURN;
  END IF;

  -- A mudança de conta/status aciona o trigger de saldo do ledger uma única vez.
  RETURN QUERY SELECT v_paid_count, v_paid_cents;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_pending_finance_card_charges_paid(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_pending_finance_card_charges_paid(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pending_finance_card_charges_paid(uuid, uuid) TO service_role;
