import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  canManageFinanceCategories,
  isFinanceCategoryDuplicate,
  validateFinanceCategoryInput,
  type FinanceCategoryInput,
} from "../src/lib/finance-category-rules";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";

function candidate(overrides: Partial<FinanceCategoryInput> = {}): FinanceCategoryInput {
  return {
    companyId: COMPANY_A,
    name: "  Casa   e contas ",
    type: "despesa",
    color: "#7c3aed",
    ...overrides,
  };
}

describe("regras de categorias financeiras", () => {
  test("normaliza nome e cor sem perder o tipo", () => {
    expect(validateFinanceCategoryInput(candidate())).toEqual({
      companyId: COMPANY_A,
      name: "Casa e contas",
      type: "despesa",
      color: "#7C3AED",
    });
  });

  test("recusa nome vazio, nome longo, tipo inválido e cor inválida", () => {
    expect(() => validateFinanceCategoryInput(candidate({ name: "   " }))).toThrow(
      "Informe o nome da categoria",
    );
    expect(() => validateFinanceCategoryInput(candidate({ name: "a".repeat(61) }))).toThrow(
      "no máximo 60",
    );
    expect(() =>
      validateFinanceCategoryInput(
        candidate({ type: "transferencia" as FinanceCategoryInput["type"] }),
      ),
    ).toThrow("Tipo de categoria inválido");
    expect(() => validateFinanceCategoryInput(candidate({ color: "red" }))).toThrow("#RRGGBB");
  });

  test("recusa empresa que não seja UUID", () => {
    expect(() => validateFinanceCategoryInput(candidate({ companyId: "empresa-a" }))).toThrow(
      "Empresa inválida",
    );
  });

  test("deduplica sem diferenciar maiúsculas, minúsculas ou espaços", () => {
    expect(
      isFinanceCategoryDuplicate(
        [{ company_id: COMPANY_A, nome: "Casa e contas", tipo: "despesa" }],
        candidate(),
      ),
    ).toBe(true);
  });

  test("não mistura empresas nem tipos diferentes", () => {
    const rows = [
      { company_id: COMPANY_B, nome: "Casa e contas", tipo: "despesa" },
      { company_id: COMPANY_A, nome: "Casa e contas", tipo: "receita" },
    ];
    expect(isFinanceCategoryDuplicate(rows, candidate())).toBe(false);
  });

  test("somente owner e admin podem gerenciar categorias", () => {
    expect(canManageFinanceCategories("owner")).toBe(true);
    expect(canManageFinanceCategories("admin")).toBe(true);
    expect(canManageFinanceCategories("atendente")).toBe(false);
    expect(canManageFinanceCategories(null)).toBe(false);
  });

  test("cadastro inline interrompe o envio antes de alcançar o formulário externo", () => {
    const source = readFileSync(
      new URL("../src/components/finance/finance-category-dialog.tsx", import.meta.url),
      "utf8",
    );
    const submit = source.slice(
      source.indexOf("async function submit"),
      source.indexOf("const triggerElement"),
    );
    expect(submit).toContain("event.preventDefault()");
    expect(submit).toContain("event.stopPropagation()");
    expect(submit.indexOf("event.stopPropagation()")).toBeLessThan(submit.indexOf("await onSave"));
  });
});
