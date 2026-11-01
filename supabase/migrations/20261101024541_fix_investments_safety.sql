-- A meta fica somente em fin_patrimonio_meta; a coluna redundante foi criada
-- pela migração anterior, mas nunca recebeu valor diferente do padrão.
ALTER TABLE public.company
  DROP COLUMN IF EXISTS patrimonio_meta_cents;

ALTER TABLE public.fin_investimento
  ADD CONSTRAINT fin_investimento_value_max
  CHECK (valor_atual_cents <= 1000000000000);

ALTER TABLE public.fin_patrimonio_meta
  ADD CONSTRAINT fin_patrimonio_meta_goal_max
  CHECK (objetivo_cents <= 9000000000000000);

-- A aplicação grava via funções server-side após validar o usuário e a empresa.
-- O cliente autenticado mantém apenas leitura limitada à própria empresa.
DROP POLICY IF EXISTS fin_investimento_company_access ON public.fin_investimento;
CREATE POLICY fin_investimento_company_select
  ON public.fin_investimento
  FOR SELECT
  TO authenticated
  USING (has_company_access(company_id));

DROP POLICY IF EXISTS fin_patrimonio_meta_company_access ON public.fin_patrimonio_meta;
CREATE POLICY fin_patrimonio_meta_company_select
  ON public.fin_patrimonio_meta
  FOR SELECT
  TO authenticated
  USING (has_company_access(company_id));
