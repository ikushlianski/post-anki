import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadEnv = vi.fn();

vi.mock("../shared/env.js", () => ({ loadEnv: () => loadEnv() }));

const { sendMeAgentTodo, ME_AGENT_TIMEOUT_MS } = await import("./me-agent.client.js");

const URL_VALUE = "https://me.example.test/todos";

describe("me agent client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    loadEnv.mockReturnValue({ ME_AGENT_TODO_URL: URL_VALUE, ME_AGENT_TODO_TOKEN: "tok" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("should post only the title and text to the configured url", async () => {
    fetchMock.mockResolvedValue({ status: 200 });

    const result = await sendMeAgentTodo({ text: "Buy milk", title: "Milk" });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;

    expect(url).toBe(URL_VALUE);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.headers.authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ title: "Milk", text: "Buy milk" });
  });

  it("should derive a short title from the text when none is given", async () => {
    fetchMock.mockResolvedValue({ status: 204 });

    await sendMeAgentTodo({ text: "x".repeat(200) });

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).title).toHaveLength(80);
  });

  it("should omit the authorization header when no token is set", async () => {
    loadEnv.mockReturnValue({ ME_AGENT_TODO_URL: URL_VALUE });
    fetchMock.mockResolvedValue({ status: 200 });

    await sendMeAgentTodo({ text: "a" });

    expect(fetchMock.mock.calls[0]![1].headers.authorization).toBeUndefined();
  });

  it.each([[301], [400], [500]])("should report failure on status %i", async (status) => {
    fetchMock.mockResolvedValue({ status });

    expect(await sendMeAgentTodo({ text: "a" })).toEqual({ ok: false, reason: "failed" });
  });

  it("should report failure when the network call throws", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));

    expect(await sendMeAgentTodo({ text: "a" })).toEqual({ ok: false, reason: "failed" });
  });

  it("should give up after the timeout without retrying", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason));
        }),
    );

    const pending = sendMeAgentTodo({ text: "a" });

    await vi.advanceTimersByTimeAsync(ME_AGENT_TIMEOUT_MS + 1);

    expect(await pending).toEqual({ ok: false, reason: "failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("should not call out when the url is not configured", async () => {
    loadEnv.mockReturnValue({});

    expect(await sendMeAgentTodo({ text: "a" })).toEqual({ ok: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
