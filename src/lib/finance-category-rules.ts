export const FINANCE_CATEGORY_TYPES = ["receita", "despesa"] as const;
export type FinanceCategoryType = (typeof FINANCE_CATEGORY_TYPES)[number];

export type FinanceCategoryInput = {
  companyId: string;
  name: string;
  type: FinanceCategoryType;
  color: string;
};

export type FinanceCategoryCandidate = {
  companyId?: string | null;
  company_id?: string | null;
  name?: string | null;
  nome?: string | null;
  type?: string | null;
  tipo?: string | null;
};

const COMPANY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
export const FINANCE_CATEGORY_NAME_MAX_LENGTH = 60;

export function isFinanceCompanyId(value: unknown): value is string {
  return typeof value === "string" && COMPANY_ID_PATTERN.test(value.trim());
}

/** Remove espaços repetidos para que a mesma categoria não seja cadastrada com variações visuais. */
export function normalizeFinanceCategoryName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeFinanceCategoryColor(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

export function isFinanceCategoryType(value: unknown): value is FinanceCategoryType {
  return value === "receita" || value === "despesa";
}

export type FinanceCategoryDraft = {
  name: string;
  type: FinanceCategoryType;
  color: string;
};

export function validateFinanceCategoryDraft(input: {
  name?: unknown;
  type?: unknown;
  color?: unknown;
}): FinanceCategoryDraft {
  const name = normalizeFinanceCategoryName(input?.name);
  if (!name) throw new Error("Informe o nome da categoria.");
  if (name.length > FINANCE_CATEGORY_NAME_MAX_LENGTH) {
    throw new Error(
      `O nome da categoria deve ter no máximo ${FINANCE_CATEGORY_NAME_MAX_LENGTH} caracteres.`,
    );
  }

  const type = input?.type;
  if (!isFinanceCategoryType(type)) throw new Error("Tipo de categoria inválido.");

  const color = normalizeFinanceCategoryColor(input?.color);
  if (!COLOR_PATTERN.test(color)) throw new Error("Escolha uma cor válida no formato #RRGGBB.");

  return { name, type, color };
}

export function validateFinanceCategoryInput(input: {
  companyId?: unknown;
  name?: unknown;
  type?: unknown;
  color?: unknown;
}): FinanceCategoryInput {
  const companyId = String(input?.companyId ?? "").trim();
  if (!isFinanceCompanyId(companyId)) throw new Error("Empresa inválida.");
  return { companyId, ...validateFinanceCategoryDraft(input) };
}

function categoryCompanyId(row: FinanceCategoryCandidate): string | null {
  return row.companyId ?? row.company_id ?? null;
}

function categoryName(row: FinanceCategoryCandidate): string {
  return normalizeFinanceCategoryName(row.name ?? row.nome);
}

function categoryType(row: FinanceCategoryCandidate): string | null {
  return row.type ?? row.tipo ?? null;
}

export function isFinanceCategoryDuplicate(
  rows: readonly FinanceCategoryCandidate[],
  candidate: FinanceCategoryInput,
): boolean {
  const normalizedName = normalizeFinanceCategoryName(candidate.name).toLocaleLowerCase("pt-BR");
  return rows.some((row) => {
    const rowCompanyId = categoryCompanyId(row);
    return (
      (!rowCompanyId || rowCompanyId === candidate.companyId) &&
      categoryType(row) === candidate.type &&
      categoryName(row).toLocaleLowerCase("pt-BR") === normalizedName
    );
  });
}

export function canManageFinanceCategories(role: unknown): boolean {
  return role === "owner" || role === "admin";
}

export function financeCategoryDuplicateMessage(type: FinanceCategoryType): string {
  return `Já existe uma categoria de ${type === "receita" ? "entrada" : "saída"} com esse nome.`;
}
