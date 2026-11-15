CREATE TABLE public.fin_investimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 100),
  tipo text NOT NULL CHECK (tipo IN ('renda_fixa','acoes','fundos','fiis','previdencia','cripto','outros')),
  instituicao text CHECK (instituicao IS NULL OR char_length(instituicao) <= 120),
  valor_atual_cents bigint NOT NULL DEFAULT 0 CHECK (valor_atual_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fin_investimento_company_idx ON public.fin_investimento(company_id, updated_at DESC);
GRANT ALL ON public.fin_investimento TO service_role;
ALTER TABLE public.fin_investimento ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.fin_patrimonio_meta (
  company_id uuid PRIMARY KEY REFERENCES public.company(id) ON DELETE CASCADE,
  objetivo_cents bigint NOT NULL DEFAULT 0 CHECK (objetivo_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fin_patrimonio_meta TO service_role;
ALTER TABLE public.fin_patrimonio_meta ENABLE ROW LEVEL SECURITY;