ALTER TABLE public.company
  ADD COLUMN IF NOT EXISTS patrimonio_meta_cents bigint NOT NULL DEFAULT 0
  CHECK (patrimonio_meta_cents >= 0);

CREATE TABLE IF NOT EXISTS public.fin_investimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('renda_fixa', 'acoes', 'fundos', 'fiis', 'previdencia', 'cripto', 'outros')),
  instituicao text,
  valor_atual_cents bigint NOT NULL CHECK (valor_atual_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_investimento_nome_valido CHECK (char_length(btrim(nome)) BETWEEN 1 AND 100),
  CONSTRAINT fin_investimento_instituicao_valida CHECK (instituicao IS NULL OR char_length(instituicao) <= 120),
  CONSTRAINT fin_investimento_company_id_id_key UNIQUE (company_id, id)
);

CREATE INDEX IF NOT EXISTS fin_investimento_company_updated_idx
  ON public.fin_investimento (company_id, updated_at DESC);

ALTER TABLE public.fin_investimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_investimento_company_access
  ON public.fin_investimento
  FOR ALL
  TO authenticated
  USING (has_company_access(company_id))
  WITH CHECK (has_company_access(company_id));

CREATE TABLE IF NOT EXISTS public.fin_patrimonio_meta (
  company_id uuid PRIMARY KEY REFERENCES public.company(id) ON DELETE CASCADE,
  objetivo_cents bigint NOT NULL DEFAULT 0 CHECK (objetivo_cents >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fin_patrimonio_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_patrimonio_meta_company_access
  ON public.fin_patrimonio_meta
  FOR ALL
  TO authenticated
  USING (has_company_access(company_id))
  WITH CHECK (has_company_access(company_id));
