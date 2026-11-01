ALTER TABLE public.fin_investimento
  DROP CONSTRAINT fin_investimento_value_max,
  ADD CONSTRAINT fin_investimento_value_max
  CHECK (valor_atual_cents <= 900000000000);

ALTER TABLE public.fin_patrimonio_meta
  DROP CONSTRAINT fin_patrimonio_meta_goal_max,
  ADD CONSTRAINT fin_patrimonio_meta_goal_max
  CHECK (objetivo_cents <= 900000000000000);
