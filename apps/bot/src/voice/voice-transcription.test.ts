import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getFile = vi.fn();
const transcribeAudio = vi.fn();

vi.mock("../telegram/bot.js", () => ({
  getBot: () => ({ api: { getFile } }),
}));

vi.mock("../env.js", () => ({
  loadEnv: () => ({ TELEGRAM_BOT_TOKEN: "test-token" }),
}));

vi.mock("../api/client.js", () => ({
  transcribeAudio: (...args: unknown[]) => transcribeAudio(...args),
}));

vi.mock("../telegram/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { transcribeVoiceNote } = await import("./voice-transcription.js");

function mockDownload(ok: boolean, status = 200) {
  const spy = vi.fn(
    async (_url: string | URL) =>
      new Response(new Uint8Array([1, 2, 3]), { status: ok ? status : status || 500 }),
  );

  vi.stubGlobal("fetch", spy);

  return spy;
}

describe("transcribeVoiceNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads via getFile, base64-encodes, and calls transcribeAudio with the mime type read from the voice note (AC 15)", async () => {
    getFile.mockResolvedValue({ file_id: "v1", file_unique_id: "v1", file_path: "voice/file_1.oga" });
    mockDownload(true);
    transcribeAudio.mockResolvedValue({ text: "let's talk about Lambda" });

    const result = await transcribeVoiceNote("v1", "audio/ogg");

    expect(getFile).toHaveBeenCalledWith("v1");
    expect(transcribeAudio).toHaveBeenCalledWith({
      audioBase64: Buffer.from([1, 2, 3]).toString("base64"),
      mimeType: "audio/ogg",
    });
    expect(result).toBe("let's talk about Lambda");
  });

  it("falls back to audio/ogg when the message carries no mime type (AC 15)", async () => {
    getFile.mockResolvedValue({ file_id: "v1", file_unique_id: "v1", file_path: "voice/file_1.oga" });
    mockDownload(true);
    transcribeAudio.mockResolvedValue({ text: "hi" });

    await transcribeVoiceNote("v1", undefined);

    expect(transcribeAudio).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "audio/ogg" }),
    );
  });

  it("returns null, not a throw, when getFile fails (AC 16)", async () => {
    getFile.mockRejectedValue(new Error("telegram down"));

    const result = await transcribeVoiceNote("v1", "audio/ogg");

    expect(result).toBeNull();
  });

  it("returns null, not a throw, when getFile succeeds but has no file_path (AC 16)", async () => {
    getFile.mockResolvedValue({ file_id: "v1", file_unique_id: "v1" });

    const result = await transcribeVoiceNote("v1", "audio/ogg");

    expect(result).toBeNull();
  });

  it("returns null, not a throw, on a non-OK download response (AC 16)", async () => {
    getFile.mockResolvedValue({ file_id: "v1", file_unique_id: "v1", file_path: "voice/file_1.oga" });
    mockDownload(false, 404);

    const result = await transcribeVoiceNote("v1", "audio/ogg");

    expect(result).toBeNull();
  });

  it("returns null, not a throw, when transcribeAudio rejects (AC 16)", async () => {
    getFile.mockResolvedValue({ file_id: "v1", file_unique_id: "v1", file_path: "voice/file_1.oga" });
    mockDownload(true);
    transcribeAudio.mockRejectedValue(new Error("/transcriptions failed: 502"));

    const result = await transcribeVoiceNote("v1", "audio/ogg");

    expect(result).toBeNull();
  });

  it("returns the trimmed transcript on success (AC 17)", async () => {
    getFile.mockResolvedValue({ file_id: "v1", file_unique_id: "v1", file_path: "voice/file_1.oga" });
    mockDownload(true);
    transcribeAudio.mockResolvedValue({ text: "  keys dedupe retried writes  " });

    const result = await transcribeVoiceNote("v1", "audio/ogg");

    expect(result).toBe("keys dedupe retried writes");
  });
});
