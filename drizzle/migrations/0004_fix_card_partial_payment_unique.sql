CREATE OR REPLACE FUNCTION public.pay_finance_card_amount(_company_id uuid, _account_id uuid, _amount_cents bigint)
RETURNS TABLE(paid_count bigint, paid_cents bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_left bigint := _amount_cents;
  v_count bigint := 0;
  v_paid_at date := (timezone('America/Sao_Paulo', now()))::date;
  v_batch uuid := gen_random_uuid();
  v_pending bigint;
  r public.fin_lancamento%ROWTYPE;
  v_paid_meta jsonb;
BEGIN
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN
    RAISE EXCEPTION 'Informe um valor maior que zero.';
  END IF;
  PERFORM 1 FROM public.fin_conta WHERE id = _account_id AND company_id = _company_id AND ativo = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta financeira inválida ou inativa.'; END IF;
  SELECT COALESCE(SUM(valor_cents), 0) INTO v_pending FROM public.fin_lancamento
   WHERE company_id = _company_id AND tipo = 'despesa' AND forma_pagamento = 'cartao'
     AND status <> 'cancelado' AND metadata->>'card_settlement' = 'pending';
  IF _amount_cents > v_pending THEN
    RAISE EXCEPTION 'O valor informado é maior que o acumulado em aberto do cartão.';
  END IF;
  FOR r IN SELECT * FROM public.fin_lancamento
     WHERE company_id = _company_id AND tipo = 'despesa' AND forma_pagamento = 'cartao'
       AND status <> 'cancelado' AND metadata->>'card_settlement' = 'pending'
     ORDER BY competencia, created_at, id FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0;
    v_paid_meta := COALESCE(r.metadata, '{}'::jsonb) || jsonb_build_object(
      'card_settlement', 'paid', 'card_paid_account_id', _account_id,
      'card_paid_at', v_paid_at::text, 'card_payment_batch_id', v_batch);
    IF r.valor_cents <= v_left THEN
      UPDATE public.fin_lancamento SET metadata = v_paid_meta, conta_id = _account_id,
        status = 'pago', pago_em = v_paid_at, updated_at = now() WHERE id = r.id;
      v_left := v_left - r.valor_cents;
    ELSE
      UPDATE public.fin_lancamento SET valor_cents = r.valor_cents - v_left,
        metadata = COALESCE(r.metadata, '{}'::jsonb) || jsonb_build_object('card_partial_paid', true),
        updated_at = now() WHERE id = r.id;
      INSERT INTO public.fin_lancamento
      SELECT (jsonb_populate_record(NULL::public.fin_lancamento,
        to_jsonb(r) || jsonb_build_object(
          'id', gen_random_uuid(), 'valor_cents', v_left, 'conta_id', _account_id,
          'status', 'pago', 'pago_em', v_paid_at, 'created_at', now(), 'updated_at', now(),
          'ai_command_id', NULL, 'provider_transaction_id', NULL, 'crm_card_id', NULL,
          'metadata', v_paid_meta || jsonb_build_object('card_partial_of', r.id)))).*;
      v_left := 0;
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN QUERY SELECT v_count, _amount_cents - v_left;
END; $$;
REVOKE ALL ON FUNCTION public.pay_finance_card_amount(uuid, uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_finance_card_amount(uuid, uuid, bigint) TO service_role, authenticated;
NOTIFY pgrst, 'reload schema';