import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../subject/seed/english-sub-subjects.seed.js", () => ({ ensureEnglishForItSubject: vi.fn() }));
vi.mock("./notion-ingestion-source.repo.js", () => ({
  createNotionSource: vi.fn(),
  MEETING_PHRASES_PIPELINE: "meeting_phrases",
}));

const { ensureEnglishForItSubject } = await import("../subject/seed/english-sub-subjects.seed.js");
const { createNotionSource } = await import("./notion-ingestion-source.repo.js");
const { registerEnglishPhrasesSource } = await import("./register-english-phrases-source.js");

const URL_OK = "https://www.notion.so/Phrases-0123456789abcdef0123456789abcdef";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ensureEnglishForItSubject).mockResolvedValue("sub_it");
});

describe("registerEnglishPhrasesSource", () => {
  it("should create a nightly source under English for IT with removal off", async () => {
    vi.mocked(createNotionSource).mockResolvedValue({ kind: "created", source: { id: "nis_1" } as never });

    const result = await registerEnglishPhrasesSource(URL_OK);

    expect(result).toEqual({ kind: "created", sourceId: "nis_1" });
    expect(createNotionSource).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: "sub_it",
        frequency: "nightly",
        itemsPerRun: 10,
        removeAfterImport: false,
        pipeline: "meeting_phrases",
      }),
    );
  });

  it("should refuse a link that is not a Notion page before touching the database", async () => {
    expect(await registerEnglishPhrasesSource("https://evil.com/x")).toEqual({ kind: "invalid_url" });
    expect(ensureEnglishForItSubject).not.toHaveBeenCalled();
  });

  it("should report a page that is already registered", async () => {
    vi.mocked(createNotionSource).mockResolvedValue({ kind: "duplicate_page" });

    expect(await registerEnglishPhrasesSource(URL_OK)).toEqual({ kind: "duplicate_page" });
  });
});
