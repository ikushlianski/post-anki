// Offline OpenRouter-compatible stand-in: chat completions (text, schema-shaped JSON, SSE) and deterministic embeddings.
import http from "node:http";

const MAX_DEPTH = 8;

function hashToken(token) {
  let h = 2166136261;

  for (const ch of token) {
    h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  }

  return h;
}

export function embeddingFor(text, dim) {
  const tokens = String(text).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  const vec = new Array(dim).fill(0);

  for (const token of tokens.length > 0 ? tokens : [String(text)]) {
    const h = hashToken(token);

    vec[h % dim] += (h >>> 31) === 0 ? 1 : -1;
  }

  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;

  return vec.map((v) => Number((v / norm).toFixed(6)));
}

function resolveRef(ref, root) {
  return String(ref).replace(/^#\//, "").split("/").reduce((node, key) => node?.[key], root);
}

function messageText(message) {
  const content = message?.content;

  if (typeof content === "string") {
    return content;
  }

  return Array.isArray(content) ? content.map((part) => part?.text ?? "").join("\n") : "";
}

export function sourceSentences(messages = []) {
  const user = [...messages].reverse().find((m) => m?.role === "user");
  const text = messageText(user);
  const tagged = text.match(/<source>([\s\S]*?)<\/source>/u);
  const body = (tagged ? tagged[1] : text).replace(/\s+/gu, " ").trim();

  return (body.match(/[^.!?]+[.!?]*/gu) ?? []).map((s) => s.trim()).filter((s) => s.length >= 12 && s.length <= 300);
}

const QUESTION_KEYS = /^(question|front|prompt)$/iu;
const SHORT_LABEL_KEYS = /(name|tag|label|keyword|title)s?$/iu;
const EXISTING_REF_KEYS = /^(matched|existing|selected)/iu;

function isNullable(schema) {
  const variants = schema?.anyOf ?? schema?.oneOf;

  return (Array.isArray(variants) && variants.some((v) => v?.type === "null")) || (Array.isArray(schema?.type) && schema.type.includes("null"));
}

function clip(text, maxLength) {
  return maxLength && text.length > maxLength ? text.slice(0, maxLength).replace(/\s+\S*$/u, "") || text.slice(0, maxLength) : text;
}

function stringFor(key, ctx, maxLength) {
  const sentences = ctx?.sentences ?? [];

  if (sentences.length === 0) {
    return "mock text";
  }

  const sentence = sentences[ctx.cursor % sentences.length];

  if (QUESTION_KEYS.test(key ?? "")) {
    const lead = sentence.split(" ").slice(0, 4).join(" ");
    const question = /\p{Script=Cyrillic}/u.test(sentence) ? `Что известно о «${lead}»?` : `What is known about "${lead}"?`;

    return clip(question, maxLength);
  }

  if (SHORT_LABEL_KEYS.test(key ?? "")) {
    return clip(sentence.replace(/[^\p{L}\p{N} -]/gu, "").split(" ").slice(0, 3).join(" "), Math.min(maxLength ?? 60, 60));
  }

  return clip(sentence, maxLength);
}

export function sampleFromSchema(schema, root = schema, depth = 0, ctx = null, key = null) {
  if (!schema || typeof schema !== "object" || depth > MAX_DEPTH) {
    return null;
  }

  if (schema.$ref) {
    return sampleFromSchema(resolveRef(schema.$ref, root), root, depth + 1, ctx, key);
  }

  if ("const" in schema) {
    return schema.const;
  }

  if (Array.isArray(schema.enum)) {
    return schema.enum[0];
  }

  const variants = schema.anyOf ?? schema.oneOf;

  if (Array.isArray(variants)) {
    const pick = variants.find((v) => v?.type !== "null") ?? variants[0];

    return sampleFromSchema(pick, root, depth + 1, ctx, key);
  }

  const type = Array.isArray(schema.type) ? (schema.type.find((t) => t !== "null") ?? "null") : schema.type;

  if (type === "object" || schema.properties) {
    const out = {};

    for (const [name, sub] of Object.entries(schema.properties ?? {})) {
      out[name] = isNullable(sub) && EXISTING_REF_KEYS.test(name) ? null : sampleFromSchema(sub, root, depth + 1, ctx, name);
    }

    return out;
  }

  if (type === "array") {
    const min = Math.max(schema.minItems ?? 0, 0);

    const available = ctx?.sentences?.length ?? 0;
    const count = Math.max(min, Math.min(Math.max(available, 1), schema.maxItems ?? 4, 4));

    return Array.from({ length: count }, (_, index) => {
      if (ctx) {
        ctx.cursor = index;
      }

      return sampleFromSchema(schema.items, root, depth + 1, ctx, key);
    });
  }

  if (type === "string") {
    return schema.format === "date-time" ? "2026-01-01T00:00:00.000Z" : stringFor(key, ctx, schema.maxLength);
  }

  if (type === "integer" || type === "number") {
    return Math.max(schema.minimum ?? 0, 1);
  }

  if (type === "boolean") {
    return true;
  }

  return null;
}

export function chatContent(body, { seedItems = [], generic = true } = {}) {
  const schema = body?.response_format?.json_schema?.schema;
  const props = Object.keys(schema?.properties ?? {});

  if (props.includes("items") && seedItems.length > 0) {
    const prompt = JSON.stringify(body.messages ?? []);

    return JSON.stringify({ items: seedItems.filter((e) => prompt.includes(e.match)).map((e) => e.item) });
  }

  if (!generic) {
    return "{}";
  }

  if (schema) {
    return JSON.stringify(sampleFromSchema(schema, schema, 0, { sentences: sourceSentences(body.messages), cursor: 0 }));
  }

  return body?.response_format?.type === "json_object" ? "{}" : "Mock response from the local mock LLM.";
}

function completion(content) {
  return {
    id: `mock-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "mock-openrouter",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

function respond(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function streamCompletion(res, content) {
  const base = { id: `mock-${Date.now()}`, object: "chat.completion.chunk", model: "mock-openrouter" };
  const chunk = (delta, finish) => `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;

  res.writeHead(200, { "content-type": "text/event-stream" });
  res.write(chunk({ role: "assistant", content }, null));
  res.write(chunk({}, "stop"));
  res.write(`data: ${JSON.stringify({ ...base, choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
  res.end("data: [DONE]\n\n");
}

function embeddingsPayload(body, dim) {
  const inputs = Array.isArray(body.input) ? body.input : [body.input ?? ""];

  return {
    object: "list",
    model: body.model ?? "mock-embedding",
    data: inputs.map((text, index) => ({ object: "embedding", index, embedding: embeddingFor(text, dim) })),
    usage: { prompt_tokens: 1, total_tokens: 1 },
  };
}

export function createMockLlmServer({ embeddingDim = 1536, seedItems = [], generic = true } = {}) {
  return http.createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];

    if (req.method === "GET" && path === "/healthz") {
      return respond(res, 200, { ok: true });
    }

    const isChat = path.endsWith("/chat/completions");
    const isEmbeddings = path.endsWith("/embeddings");

    if (req.method !== "POST" || !(isChat || isEmbeddings)) {
      return respond(res, 404, { error: "not found" });
    }

    const chunks = [];

    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));

        if (isEmbeddings) {
          return respond(res, 200, embeddingsPayload(body, embeddingDim));
        }

        const content = chatContent(body, { seedItems, generic });

        return body.stream ? streamCompletion(res, content) : respond(res, 200, completion(content));
      } catch {
        respond(res, 400, { error: "bad request" });
      }
    });
  });
}
