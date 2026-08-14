import { Readable } from "node:stream";
import type http from "node:http";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MAX_BODY_BYTES } from "../shared/http.js";

const transcribeAudio = vi.fn();

vi.mock("./transcription-client.js", () => ({
  transcribeAudio: (...args: unknown[]) => transcribeAudio(...args),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { handleCreateTranscription } = await import("./transcription.controller.js");

function fakeReq(body: string): http.IncomingMessage {
  return Readable.from([Buffer.from(body)]) as unknown as http.IncomingMessage;
}

function fakeRes(): http.ServerResponse & { status: number | null; body: unknown } {
  const res = {
    status: null as number | null,
    body: undefined as unknown,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end(payload?: string) {
      res.body = payload ? JSON.parse(payload) : undefined;
    },
  };

  return res as unknown as http.ServerResponse & { status: number | null; body: unknown };
}

describe("handleCreateTranscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the transcript on a valid body (AC 18)", async () => {
    transcribeAudio.mockResolvedValue("let's talk about Lambda");
    const req = fakeReq(JSON.stringify({ audioBase64: "abc", mimeType: "audio/ogg" }));
    const res = fakeRes();

    await handleCreateTranscription(req, res);

    expect(transcribeAudio).toHaveBeenCalledWith({ audioBase64: "abc", mimeType: "audio/ogg" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: "let's talk about Lambda" });
  });

  it("rejects a body missing required fields with 400, never calling the transcription client", async () => {
    const req = fakeReq(JSON.stringify({ audioBase64: "abc" }));
    const res = fakeRes();

    await handleCreateTranscription(req, res);

    expect(res.status).toBe(400);
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it("maps a transcription-client failure to a 502, not a silent empty transcript", async () => {
    transcribeAudio.mockRejectedValue(new Error("transcription endpoint returned 500: boom"));
    const req = fakeReq(JSON.stringify({ audioBase64: "abc", mimeType: "audio/ogg" }));
    const res = fakeRes();

    await handleCreateTranscription(req, res);

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("transcription_failed");
  });

  it("rejects a body exceeding MAX_BODY_BYTES via the existing shared readJsonBody machinery, no new size check (AC 20)", async () => {
    const huge = JSON.stringify({ audioBase64: "a".repeat(MAX_BODY_BYTES + 10), mimeType: "audio/ogg" });
    const req = fakeReq(huge);
    const res = fakeRes();

    await handleCreateTranscription(req, res);

    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toBe("request body too large");
    expect(transcribeAudio).not.toHaveBeenCalled();
  });
});
