import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockLlmServer } from "../../../../scripts/lib/mock-llm.mjs";

const DIM = 64;
const server = createMockLlmServer({ embeddingDim: DIM });
let base = "";

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterAll(() => {
  server.close();
});

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local mock LLM", () => {
  it("should return one embedding of the configured size per input, in order", async () => {
    const res = await post("/embeddings", { model: "m", input: ["alpha", "beta"] });
    const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };

    expect(json.data.map((d) => d.index)).toEqual([0, 1]);
    expect(json.data.every((d) => d.embedding.length === DIM)).toBe(true);
  });

  it("should give the same vector for the same text so duplicate detection is stable", async () => {
    const [a, b, c] = await Promise.all(
      ["same", "same", "different"].map(async (input) => {
        const json = (await (await post("/embeddings", { input })).json()) as { data: { embedding: number[] }[] };

        return json.data[0]!.embedding;
      }),
    );

    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("should answer structured-output requests with JSON that matches the requested schema", async () => {
    const schema = {
      type: "object",
      properties: {
        title: { type: "string" },
        score: { type: "integer" },
        kind: { enum: ["basic", "cloze"] },
        tags: { type: "array", items: { type: "string" } },
        nested: { $ref: "#/definitions/inner" },
      },
      definitions: { inner: { type: "object", properties: { ok: { type: "boolean" } } } },
    };
    const res = await post("/chat/completions", {
      messages: [{ role: "user", content: "x" }],
      response_format: { type: "json_schema", json_schema: { name: "s", schema } },
    });
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    const parsed = JSON.parse(json.choices[0]!.message.content) as Record<string, unknown>;

    expect(parsed).toMatchObject({ kind: "basic", nested: { ok: true } });
    expect(typeof parsed.title).toBe("string");
    expect(typeof parsed.score).toBe("number");
    expect(Array.isArray(parsed.tags)).toBe(true);
  });

  it("should answer plain chat with text and stream it when asked", async () => {
    const plain = (await (await post("/chat/completions", { messages: [] })).json()) as {
      choices: { message: { content: string } }[];
    };
    const streamed = await (await post("/chat/completions", { messages: [], stream: true })).text();

    expect(plain.choices[0]!.message.content.length).toBeGreaterThan(0);
    expect(streamed).toContain("data: [DONE]");
  });

  it("should quote a real sentence from the prompt's source so quote-in-source checks pass", async () => {
    const source = "Raft elects a leader with randomized timeouts. A follower becomes a candidate when the timeout expires.";
    const schema = {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "object", properties: { question: { type: "string" }, quote: { type: "string" } } },
        },
      },
    };
    const res = await post("/chat/completions", {
      messages: [{ role: "user", content: `<source>\n${source}\n</source>` }],
      response_format: { type: "json_schema", json_schema: { name: "s", schema } },
    });
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    const { items } = JSON.parse(json.choices[0]!.message.content) as { items: { question: string; quote: string }[] };

    expect(items).toHaveLength(2);
    expect(items.every((item) => source.includes(item.quote) && item.quote.length >= 12)).toBe(true);
    expect(items.every((item) => item.question.endsWith("?") && !item.question.includes(item.quote))).toBe(true);
  });

  it("should return short tag-like names and leave matched-id fields null", async () => {
    const schema = {
      type: "object",
      properties: {
        candidateNames: { type: "array", items: { type: "string" } },
        matchedTopicId: { anyOf: [{ type: "string" }, { type: "null" }] },
        suggestedPlacement: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
    };
    const res = await post("/chat/completions", {
      messages: [{ role: "user", content: "A long sentence about consensus protocols and leader election in clusters of servers." }],
      response_format: { type: "json_schema", json_schema: { name: "s", schema } },
    });
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    const parsed = JSON.parse(json.choices[0]!.message.content) as {
      candidateNames: string[];
      matchedTopicId: string | null;
      suggestedPlacement: string | null;
    };

    expect(parsed.candidateNames.every((name) => name.length > 0 && name.length <= 60)).toBe(true);
    expect(parsed.matchedTopicId).toBeNull();
    expect(typeof parsed.suggestedPlacement).toBe("string");
  });

  it("should embed texts that share words closer together than unrelated texts so grounded search finds them", async () => {
    const [query, related, unrelated] = await Promise.all(
      ["leader election in raft", "how raft handles leader election", "baking sourdough bread at home"].map(
        async (input) => {
          const json = (await (await post("/embeddings", { input })).json()) as { data: { embedding: number[] }[] };

          return json.data[0]!.embedding;
        },
      ),
    );
    const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i]!, 0);

    expect(dot(query!, related!)).toBeGreaterThan(0.3);
    expect(dot(query!, unrelated!)).toBeLessThan(0.3);
  });
});
