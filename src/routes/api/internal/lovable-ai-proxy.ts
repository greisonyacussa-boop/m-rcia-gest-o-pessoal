import { createFileRoute } from "@tanstack/react-router";
import { lovableAiGatewayChat, type ChatMsg } from "@/lib/lovable-ai.server";
import { LOVABLE_AI_MODEL } from "@/lib/lovable-ai-config";

const MAX_BODY_BYTES = 10_000_000;
const MAX_PART_BYTES = 9_000_000;
const ROLES = new Set(["system", "user", "assistant"]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

class RequestBodyTooLargeError extends Error {}

async function readLimitedRequestBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function constantTimeEqual(expected: string, actual: string) {
  const encoder = new TextEncoder();
  const left = encoder.encode(expected);
  const right = encoder.encode(actual);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}

function isChatMessage(value: unknown): value is ChatMsg {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.role !== "string" || !ROLES.has(row.role)) return false;
  if (typeof row.content === "string") return row.content.length <= 50_000;
  if (!Array.isArray(row.content) || row.content.length < 1 || row.content.length > 4) return false;

  return row.content.every((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return false;
    const item = part as Record<string, unknown>;
    if (item.type === "text") return typeof item.text === "string" && item.text.length <= 50_000;

    if (item.type === "image_url" && item.image_url && typeof item.image_url === "object") {
      const image = item.image_url as Record<string, unknown>;
      const detail = image.detail;
      return (
        typeof image.url === "string" &&
        image.url.length <= MAX_PART_BYTES &&
        /^data:image\/(?:png|jpeg|webp);base64,/i.test(image.url) &&
        (detail == null || detail === "low" || detail === "high" || detail === "auto")
      );
    }

    if (item.type === "file" && item.file && typeof item.file === "object") {
      const file = item.file as Record<string, unknown>;
      return (
        typeof file.filename === "string" &&
        file.filename.length <= 120 &&
        typeof file.file_data === "string" &&
        file.file_data.length <= MAX_PART_BYTES &&
        /^data:application\/pdf;base64,/i.test(file.file_data)
      );
    }

    return false;
  });
}

export const Route = createFileRoute("/api/internal/lovable-ai-proxy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.MARCIA_AI_PROXY_SECRET?.trim() || "";
        if (expected.length < 32) return json({ error: "AI proxy is not configured." }, 503);

        const authorization = request.headers.get("authorization") || "";
        const actual = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
        if (!constantTimeEqual(expected, actual)) return json({ error: "Unauthorized." }, 401);

        if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
          return json({ error: "Expected application/json." }, 415);
        }

        const declaredLength = Number(request.headers.get("content-length") || 0);
        if (declaredLength > MAX_BODY_BYTES) return json({ error: "Request too large." }, 413);

        let raw: string;
        try {
          raw = await readLimitedRequestBody(request);
        } catch (error) {
          if (error instanceof RequestBodyTooLargeError) {
            return json({ error: "Request too large." }, 413);
          }
          return json({ error: "Invalid request body." }, 400);
        }

        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return json({ error: "Invalid JSON." }, 400);
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return json({ error: "Invalid request." }, 400);
        }

        const input = body as Record<string, unknown>;
        const messages = input.messages;
        const model = typeof input.model === "string" ? input.model : LOVABLE_AI_MODEL;
        if (
          !Array.isArray(messages) ||
          messages.length < 1 ||
          messages.length > 20 ||
          !messages.every(isChatMessage) ||
          model.length > 100 ||
          !/^[A-Za-z0-9._/-]+$/.test(model)
        ) {
          return json({ error: "Invalid AI request." }, 400);
        }

        try {
          const text = await lovableAiGatewayChat(messages, model);
          return json({ text });
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message.includes("Créditos de IA esgotados")) {
            return json({ error: "AI credits exhausted." }, 402);
          }
          if (message.includes("Limite de uso da IA")) {
            return json({ error: "AI rate limit reached." }, 429);
          }
          if (message.includes("LOVABLE_API_KEY ausente")) {
            return json({ error: "Lovable AI is not configured." }, 503);
          }
          return json({ error: "Lovable AI is temporarily unavailable." }, 502);
        }
      },
    },
  },
});
