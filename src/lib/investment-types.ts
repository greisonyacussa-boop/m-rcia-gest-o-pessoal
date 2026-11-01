export const INVESTMENT_TYPES = [
  "renda_fixa",
  "acoes",
  "fundos",
  "fiis",
  "previdencia",
  "cripto",
  "outros",
] as const;

export type InvestmentType = (typeof INVESTMENT_TYPES)[number];

export const INVESTMENT_TYPE_LABELS: Record<InvestmentType, string> = {
  renda_fixa: "Renda fixa",
  acoes: "Ações",
  fundos: "Fundos e ETFs",
  fiis: "Fundos imobiliários",
  previdencia: "Previdência",
  cripto: "Criptoativos",
  outros: "Outros",
};

// Valores em centavos, compatíveis com o parser pt-BR e limites bigint do banco.
export const MAX_INVESTMENT_CENTS = 900_000_000_000;
export const MAX_PATRIMONY_TARGET_CENTS = 900_000_000_000_000;
export const MAX_INVESTMENTS_PER_COMPANY = 1_000;
