// IA centralizada no Lovable AI. O projeto recebe LOVABLE_API_KEY de forma
// gerenciada; o aluno nunca informa ou armazena chaves de provedores no app.

import { LOVABLE_AI_MODEL } from "./lovable-ai-config";
import { fetchAiProvider } from "./ai-request.server";

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
        | { type: "file"; file: { filename: string; file_data: string } }
      >;
}

export interface LovableAiConfig {
  model?: string;
}

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

function getLovableProxyUrl() {
  const raw = process.env.LOVABLE_AI_PROXY_URL?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("LOVABLE_AI_PROXY_URL não é uma URL válida.");
  }

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "conversa-kanban-compass.lovable.app" ||
    url.port !== "" ||
    url.pathname !== "/api/internal/lovable-ai-proxy" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "LOVABLE_AI_PROXY_URL deve apontar por HTTPS para o domínio publicado da Lovable.",
    );
  }

  return url.toString();
}

function gatewayFailureMessage(status: number, responseBody: string) {
  if (status === 429) return "Limite de uso da IA atingido. Tente em alguns minutos.";
  if (status === 402) return "Créditos de IA esgotados no workspace.";
  return `Lovable AI: ${status} ${responseBody.slice(0, 300)}`;
}

/** Chama exclusivamente o gateway gerenciado no runtime Lovable; não consulta BYOK nem o banco. */
export async function lovableAiGatewayChat(
  messages: ChatMsg[],
  model: string = LOVABLE_AI_MODEL,
): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente no runtime Lovable.");

  const res = await fetchAiProvider("Lovable AI", GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) throw new Error(gatewayFailureMessage(res.status, await res.text()));

  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.toString().trim() || "";
}

async function lovableAiProxyChat(url: string, secret: string, model: string, messages: ChatMsg[]) {
  const res = await fetchAiProvider("Lovable AI proxy", url, {
    method: "POST",
    redirect: "error",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok) {
    if (res.status === 429 || res.status === 402)
      throw new Error(gatewayFailureMessage(res.status, ""));
    if (res.status === 503)
      throw new Error("Backend Lovable não configurado. Confira os secrets do proxy.");
    throw new Error(`Lovable AI proxy: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }

  const data = await res.json();
  if (typeof data?.text !== "string") throw new Error("Resposta inválida do proxy Lovable AI.");
  return data.text.trim();
}

export async function lovableAiChat(
  messages: ChatMsg[],
  modelOrConfig: string | LovableAiConfig = LOVABLE_AI_MODEL,
): Promise<string> {
  const cfg: LovableAiConfig =
    typeof modelOrConfig === "string" ? { model: modelOrConfig } : modelOrConfig;
  // BYOK opcional (OpenAI ou Anthropic) só quando ativado e testado no Master.
  const { maybeByokChat } = await import("./ai-provider.server");
  const byok = await maybeByokChat(messages);
  if (byok !== null) return byok;

  // Modelo escolhido no Master vale quando o chamador usa o padrão e o modo otimizado está desligado.
  const { getAiProviderConfig } = await import("./ai-provider.server");
  const providerCfg = await getAiProviderConfig();
  const chosen =
    providerCfg?.mode === "lovable" && providerCfg?.optimized === false && providerCfg?.model
      ? String(providerCfg.model)
      : null;
  const requested = cfg.model || LOVABLE_AI_MODEL;
  const model = chosen && requested === LOVABLE_AI_MODEL ? chosen : requested;

  const proxyUrl = getLovableProxyUrl();
  if (proxyUrl) {
    const secret = process.env.MARCIA_AI_PROXY_SECRET?.trim();
    if (!secret) throw new Error("MARCIA_AI_PROXY_SECRET não configurado no runtime Vercel.");
    return lovableAiProxyChat(proxyUrl, secret, model, messages);
  }

  if (process.env.VERCEL === "1") {
    throw new Error(
      "LOVABLE_AI_PROXY_URL não configurada na Vercel; a IA deve ser chamada pelo backend Lovable.",
    );
  }

  // Fora da Vercel, como no host Lovable, usa a chave gerenciada diretamente.
  return lovableAiGatewayChat(messages, model);
}
