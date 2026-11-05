export type FinancePaymentMethod =
  "pix" | "cartao" | "dinheiro" | "transferencia" | "boleto" | "outro";

export type FinancePaymentMethodDetection = FinancePaymentMethod | "unknown" | null;

type PaymentMessage = { role?: unknown; content?: unknown };

function fold(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const PAYMENT_METHOD_LABELS: Record<FinancePaymentMethod, string> = {
  pix: "Pix",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
  boleto: "Boleto",
  outro: "Outro",
};

/** Canonicalizes a single payment-method value without treating unknown input as Pix. */
export function canonicalizeFinancePaymentMethod(value: unknown): FinancePaymentMethod | "unknown" {
  const normalized = fold(value);
  if (!normalized) return "unknown";
  if (normalized === "pix") return "pix";
  if (normalized === "cartao" || normalized === "cartao de credito" || normalized === "credito")
    return "cartao";
  if (normalized === "dinheiro" || normalized === "dinheiro em especie" || normalized === "especie")
    return "dinheiro";
  if (
    normalized === "transferencia" ||
    normalized === "transferencia bancaria" ||
    normalized === "ted" ||
    normalized === "doc"
  )
    return "transferencia";
  if (normalized === "boleto") return "boleto";
  if (normalized === "outro" || normalized === "outra") return "outro";
  return "unknown";
}

/** Finds an explicit payment method in user text; null means no method was mentioned. */
export function detectExplicitFinancePaymentMethod(text: string): FinancePaymentMethodDetection {
  const normalized = fold(text);
  if (!normalized) return null;

  // Debit is deliberately unsupported. Check it before the generic "cartao" alias.
  if (/\b(?:cartao de )?debito\b/.test(normalized)) return "unknown";

  const corrections: Array<{
    rejected: RegExp;
    affirmed: RegExp;
    method: FinancePaymentMethod;
  }> = [
    {
      rejected: /\bnao(?:\s+\w+){0,3}\s+pix\b/,
      affirmed:
        /\b(?:mas|foi|era|usei|paguei|pago|utilizei)\b(?:\s+\w+){0,6}\s+cartao(?: de credito)?\b/,
      method: "cartao",
    },
    {
      rejected: /\bnao(?:\s+\w+){0,3}\s+cartao(?: de credito)?\b/,
      affirmed: /\b(?:mas|foi|era|usei|paguei|pago|utilizei)\b(?:\s+\w+){0,6}\s+pix\b/,
      method: "pix",
    },
  ];
  for (const correction of corrections) {
    const rejected = correction.rejected.exec(normalized);
    if (!rejected) continue;
    const afterRejected = normalized.slice(rejected.index + rejected[0].length);
    if (correction.affirmed.test(afterRejected)) return correction.method;
  }

  const terms: Array<[FinancePaymentMethod, RegExp]> = [
    ["pix", /\bpix\b/g],
    ["cartao", /\bcartao(?: de credito)?\b|\bcredito\b/g],
    ["dinheiro", /\bdinheiro(?: em especie)?\b|\bespecie\b/g],
    ["transferencia", /\btransferencia(?: bancaria)?\b|\bted\b|\bdoc\b/g],
    ["boleto", /\bboleto\b/g],
    ["outro", /\boutro\b|\boutra\b/g],
  ];
  const clauses = text
    .split(/[,;.!?]+|\b(?:e|mas|porem|todavia|entretanto|contudo|na verdade)\b/gi)
    .map(fold)
    .filter(Boolean);
  const positiveMethods = new Set<FinancePaymentMethod>();
  let mentionCount = 0;
  for (const clause of clauses) {
    const clauseMethods: FinancePaymentMethod[] = [];
    for (const [method, expression] of terms) {
      if (expression.test(clause)) clauseMethods.push(method);
      expression.lastIndex = 0;
    }
    mentionCount += clauseMethods.length;
    if (/\b(?:nao|nunca)\b/.test(clause)) continue;
    clauseMethods.forEach((method) => positiveMethods.add(method));
  }
  if (!mentionCount) return null;
  if (positiveMethods.size !== 1) return "unknown";
  return positiveMethods.values().next().value || "unknown";
}

/** Returns the last explicit method stated by the user, including an explicit unknown/debit choice. */
export function lastExplicitFinancePaymentMethod(
  messages: readonly PaymentMessage[] | null | undefined,
): FinancePaymentMethodDetection {
  let result: FinancePaymentMethodDetection = null;
  for (const message of messages || []) {
    if (message?.role !== "user" || typeof message.content !== "string") continue;
    const detected = detectExplicitFinancePaymentMethod(message.content);
    if (detected !== null) result = detected;
  }
  return result;
}

/** Current explicit text wins; absent current text may reuse only an explicitly stated prior method. */
export function resolveExplicitFinancePaymentMethod(
  currentText: string,
  previousMessages: readonly PaymentMessage[] | null | undefined,
): FinancePaymentMethod | null {
  const current = detectExplicitFinancePaymentMethod(currentText);
  if (current !== null) return current === "unknown" ? null : current;
  const previous = lastExplicitFinancePaymentMethod(previousMessages);
  return previous && previous !== "unknown" ? previous : null;
}

export function needsFinancePaymentMethod(
  intent: string,
  paymentStatus: string | null | undefined,
  paymentMethod: FinancePaymentMethod | null | undefined,
) {
  return (
    (intent === "record_expense" || intent === "record_income") &&
    paymentStatus !== "pending" &&
    !paymentMethod
  );
}

export function financePaymentMethodQuestion() {
  return {
    message: "Como essa movimentação foi paga?",
    quickReplies: ["Pix", "Cartão", "Dinheiro", "Transferência", "Boleto", "Outro"],
  };
}

export function financePaymentMethodLabelFromText(text: string) {
  const method = detectExplicitFinancePaymentMethod(text);
  return method && method !== "unknown" ? PAYMENT_METHOD_LABELS[method] : "Não informada";
}
