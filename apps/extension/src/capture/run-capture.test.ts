import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CaptureBody } from "./build-capture-text.js";
import { loadPendingCapture } from "./pending-capture.js";
import { retryPendingCapture, runCapture } from "./run-capture.js";
import type { SendCaptureResult } from "./send-capture.js";

const SETTINGS = { baseUrl: "http://localhost:5560", token: "secret-token" };
const BODY: CaptureBody = { text: "selected words", sourceUrl: "https://example.com", title: "Page" };

function stubSession() {
  const data: Record<string, unknown> = {};

  vi.stubGlobal("chrome", {
    storage: {
      session: {
        get: vi.fn(async (key: string) => (key in data ? { [key]: data[key] } : {})),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(data, items);
        }),
        remove: vi.fn(async (key: string) => {
          delete data[key];
        }),
      },
    },
  });

  return data;
}

function sender(...results: SendCaptureResult[]) {
  const send = vi.fn<(body: CaptureBody) => Promise<SendCaptureResult>>();

  for (const result of results) {
    send.mockResolvedValueOnce(result);
  }

  return send;
}

describe("runCapture", () => {
  let data: Record<string, unknown>;

  beforeEach(() => {
    data = stubSession();
  });

  it("should keep the selection and mark it retryable when the network fails", async () => {
    const outcome = await runCapture(BODY, SETTINGS, sender({ ok: false, reason: "network" }));

    expect(outcome.retryable).toBe(true);
    expect(await loadPendingCapture()).toEqual(BODY);
  });

  it("should keep the selection when the server answers 5xx", async () => {
    const outcome = await runCapture(BODY, SETTINGS, sender({ ok: false, reason: "unexpected", status: 503 }));

    expect(outcome.retryable).toBe(true);
    expect(await loadPendingCapture()).toEqual(BODY);
  });

  it("should not keep a selection the server rejected for good", async () => {
    const outcome = await runCapture(BODY, SETTINGS, sender({ ok: false, reason: "bad_request" }));

    expect(outcome.retryable).toBe(false);
    expect(await loadPendingCapture()).toBeNull();
  });

  it("should never store the token", async () => {
    await runCapture(BODY, SETTINGS, sender({ ok: false, reason: "network" }));

    expect(JSON.stringify(data)).not.toContain("secret-token");
  });
});

describe("retryPendingCapture", () => {
  beforeEach(() => {
    stubSession();
  });

  it("should resend the kept selection and clear it on success", async () => {
    await runCapture(BODY, SETTINGS, sender({ ok: false, reason: "network" }));
    const send = sender({ ok: true });

    const outcome = await retryPendingCapture(SETTINGS, send);

    expect(send).toHaveBeenCalledWith(BODY, SETTINGS);
    expect(outcome).toEqual({ result: { ok: true }, retryable: false });
    expect(await loadPendingCapture()).toBeNull();
  });

  it("should keep the selection when the retry fails again", async () => {
    await runCapture(BODY, SETTINGS, sender({ ok: false, reason: "network" }));

    const outcome = await retryPendingCapture(SETTINGS, sender({ ok: false, reason: "network" }));

    expect(outcome?.retryable).toBe(true);
    expect(await loadPendingCapture()).toEqual(BODY);
  });

  it("should do nothing when there is no kept selection", async () => {
    const send = sender();

    expect(await retryPendingCapture(SETTINGS, send)).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("should clear a stale kept selection when a new capture succeeds", async () => {
    await runCapture(BODY, SETTINGS, sender({ ok: false, reason: "network" }));
    await runCapture({ text: "newer" }, SETTINGS, sender({ ok: true }));

    expect(await loadPendingCapture()).toBeNull();
  });
});
