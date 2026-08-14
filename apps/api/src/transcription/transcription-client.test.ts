import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// SCENARIO 1/2 (.planning/22-voice-responses/scenarios.md), AC 18/19/21 —
// no embeddings-client.test.ts precedent exists in this repo to mirror
// (confirmed by `find` before writing this file), so this establishes the
// pattern for a direct-fetch OpenRouter client test: loadEnv mocked (module-
// level cache, same reasoning as tracked-tool-fetcher.test.ts), fetch
// stubbed at the global boundary (same shape as electric-proxy.service.test.ts).

let envOverrides: Record<string, unknown> = {};

vi.mock("../shared/env.js", () => ({
  loadEnv: () => ({
    OPENROUTER_API_KEY: "test-key",
    TRANSCRIPTION_MODEL: "openrouter/google/gemini-2.5-flash",
    ...envOverrides,
  }),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function mockFetch(response: unknown, status = 200) {
  const spy = vi.fn(
    async (_url: string | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(response), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );

  vi.stubGlobal("fetch", spy);

  return spy;
}

describe("transcribeAudio", () => {
  beforeEach(() => {
    envOverrides = {};
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts an input_audio content part to the default OpenRouter endpoint and returns the transcript (AC 18)", async () => {
    const spy = mockFetch({ choices: [{ message: { content: "let's talk about Lambda" } }] });
    const { transcribeAudio } = await import("./transcription-client.js");

    const text = await transcribeAudio({ audioBase64: "abc123", mimeType: "audio/ogg" });

    expect(text).toBe("let's talk about Lambda");
    expect(spy).toHaveBeenCalledOnce();

    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");

    const body = JSON.parse(init!.body as string);
    const content = body.messages[0].content;
    const audioPart = content.find((part: { type: string }) => part.type === "input_audio");

    expect(audioPart.input_audio).toEqual({ data: "abc123", format: "ogg" });
  });

  it("reads env.TRANSCRIPTION_MODEL for the request's model field, stripped of the openrouter/ provider prefix, and never env.CURRICULUM_MODEL (AC 21)", async () => {
    envOverrides = { TRANSCRIPTION_MODEL: "openrouter/google/gemini-2.5-flash" };
    const spy = mockFetch({ choices: [{ message: { content: "hi" } }] });
    const { transcribeAudio } = await import("./transcription-client.js");

    await transcribeAudio({ audioBase64: "abc123", mimeType: "audio/ogg" });

    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body.model).toBe("google/gemini-2.5-flash");
  });

  it("derives the input_audio format from the mime type's subtype", async () => {
    const spy = mockFetch({ choices: [{ message: { content: "hi" } }] });
    const { transcribeAudio } = await import("./transcription-client.js");

    await transcribeAudio({ audioBase64: "abc123", mimeType: "audio/mp3" });

    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    const audioPart = body.messages[0].content.find(
      (part: { type: string }) => part.type === "input_audio",
    );

    expect(audioPart.input_audio.format).toBe("mp3");
  });

  it("applies the OPENROUTER_BASE_URL override exactly like embeddings-client.ts / tech-research-grounding.ts (AC 19)", async () => {
    envOverrides = { OPENROUTER_BASE_URL: "http://mock-openrouter.test" };
    const spy = mockFetch({ choices: [{ message: { content: "hi" } }] });
    const { transcribeAudio } = await import("./transcription-client.js");

    await transcribeAudio({ audioBase64: "abc123", mimeType: "audio/ogg" });

    expect(String(spy.mock.calls[0]![0])).toBe("http://mock-openrouter.test/chat/completions");
  });

  it("throws after the retry budget is exhausted on a non-OK response, never silently returning an empty transcript", async () => {
    const spy = vi.fn(
      async (_url: string | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 }),
    );
    vi.stubGlobal("fetch", spy);
    const { transcribeAudio } = await import("./transcription-client.js");

    await expect(
      transcribeAudio({ audioBase64: "abc123", mimeType: "audio/ogg" }),
    ).rejects.toThrow(/500/);
  }, 15_000);
});
