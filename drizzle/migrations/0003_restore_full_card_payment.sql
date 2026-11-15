CREATE OR REPLACE FUNCTION public.mark_pending_finance_card_charges_paid(_company_id uuid, _account_id uuid)
RETURNS TABLE(paid_count bigint, paid_cents bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pending bigint;
BEGIN
  SELECT COALESCE(SUM(valor_cents),0) INTO v_pending FROM public.fin_lancamento
   WHERE company_id = _company_id AND tipo = 'despesa' AND forma_pagamento = 'cartao'
     AND status <> 'cancelado' AND metadata->>'card_settlement' = 'pending';
  IF v_pending <= 0 THEN RAISE EXCEPTION 'Não há compras em aberto no cartão.'; END IF;
  RETURN QUERY SELECT * FROM public.pay_finance_card_amount(_company_id, _account_id, v_pending);
END $$;
REVOKE ALL ON FUNCTION public.mark_pending_finance_card_charges_paid(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pending_finance_card_charges_paid(uuid, uuid) TO service_role;
NOTIFY pgrst, 'reload schema';