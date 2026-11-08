import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findBitsByExactBody,
  findReadyCardsByExactText,
  findSourcesByExactTextOrKey,
  type DuplicateSourceRow,
} from "../knowledge-source/knowledge-source-duplicate-lookup.repo.js";

vi.mock("../knowledge-source/knowledge-source-duplicate-lookup.repo.js", () => ({
  findSourcesByExactTextOrKey: vi.fn(),
  findBitsByExactBody: vi.fn(),
  findReadyCardsByExactText: vi.fn(),
}));

const { checkDuplicates, checkDuplicatesInputSchema, CHECK_DUPLICATES_MAX_MATCHES_PER_KIND, CHECK_DUPLICATES_EXCERPT_LENGTH } =
  await import("./check-duplicates.tool.js");

afterEach(() => {
  vi.clearAllMocks();
});

function source(overrides: Partial<DuplicateSourceRow> = {}): DuplicateSourceRow {
  return {
    id: "ks_1",
    rawText: "Raft elects one leader per term.",
    summary: null,
    importKey: null,
    subjectId: "sub_1",
    subjectName: "Distributed systems",
    ...overrides,
  };
}

function mockLookups(sources: DuplicateSourceRow[] = []): void {
  vi.mocked(findSourcesByExactTextOrKey).mockResolvedValue(sources);
  vi.mocked(findBitsByExactBody).mockResolvedValue([]);
  vi.mocked(findReadyCardsByExactText).mockResolvedValue([]);
}

describe("check_duplicates", () => {
  it("should tell the caller a draft already exists and which source holds it", async () => {
    mockLookups([source()]);

    const result = await checkDuplicates({
      drafts: [{ text: "Raft elects one leader per term." }, { text: "Brand new idea" }],
    });

    expect(result.items[0]).toMatchObject({
      index: 0,
      exists: true,
      sources: [{ id: "ks_1", subjectName: "Distributed systems", matchedBy: "text", match: "exact" }],
    });
    expect(result.items[1]).toMatchObject({ index: 1, exists: false, sources: [] });
  });

  it("should report a key match as a duplicate even though the text differs", async () => {
    mockLookups([source({ importKey: "anki:abc12345" })]);

    const result = await checkDuplicates({ drafts: [{ text: "Edited text", key: "anki:abc12345" }] });

    expect(result.items[0]).toMatchObject({ exists: true, sources: [{ id: "ks_1", matchedBy: "key", match: "exact" }] });
  });

  it("should pass the subject filter and de-duplicated drafts to the lookups", async () => {
    mockLookups();

    await checkDuplicates({ drafts: [{ text: "a" }, { text: "a" }, { text: "b", key: "anki:abc12345" }], subjectId: "sub_9" });

    expect(findSourcesByExactTextOrKey).toHaveBeenCalledWith(["a", "b"], ["anki:abc12345"], "sub_9", []);
    expect(findBitsByExactBody).toHaveBeenCalledWith(["a", "b"], "sub_9", []);
  });

  it("should keep the reply small by capping matches per draft and shortening excerpts", async () => {
    const long = "x".repeat(5000);

    mockLookups(Array.from({ length: 12 }, (_, i) => source({ id: `ks_${i}`, rawText: long })));

    const [item] = (await checkDuplicates({ drafts: [{ text: long }] })).items;

    expect(item!.sources).toHaveLength(CHECK_DUPLICATES_MAX_MATCHES_PER_KIND);
    expect(item!.sources[0]!.excerpt.length).toBeLessThanOrEqual(CHECK_DUPLICATES_EXCERPT_LENGTH + 1);
  });

  it("should find a source, bit and card whose text differs only in case, spacing or punctuation", async () => {
    vi.mocked(findSourcesByExactTextOrKey).mockResolvedValue([source({ rawText: "Raft elects one leader per term." })]);
    vi.mocked(findBitsByExactBody).mockResolvedValue([{ id: "kb_1", body: "RAFT elects one leader, per term!", knowledgeSourceId: "ks_1" }]);
    vi.mocked(findReadyCardsByExactText).mockResolvedValue([{ cardId: "c_1", matchedText: "raft  elects one leader per term", topicId: "t_1" }]);

    const [item] = (await checkDuplicates({ drafts: [{ text: "raft elects one leader per term" }] })).items;

    expect(item).toMatchObject({
      exists: true,
      sources: [{ id: "ks_1", matchedBy: "text", match: "normalized" }],
      knowledgeBits: [{ id: "kb_1", match: "normalized" }],
      cards: [{ id: "c_1", match: "normalized" }],
    });
    expect(findSourcesByExactTextOrKey).toHaveBeenCalledWith(
      ["raft elects one leader per term"],
      [],
      undefined,
      ["raftelectsoneleaderperterm"],
    );
  });

  it("should list exact matches before normalized ones and label each", async () => {
    mockLookups([
      source({ id: "ks_norm", rawText: "RAFT elects one leader per term" }),
      source({ id: "ks_exact", rawText: "Raft elects one leader per term." }),
    ]);

    const [item] = (await checkDuplicates({ drafts: [{ text: "Raft elects one leader per term." }] })).items;

    expect(item!.sources.map((s) => [s.id, s.match])).toEqual([
      ["ks_exact", "exact"],
      ["ks_norm", "normalized"],
    ]);
  });

  it("should not fuzzy-match short drafts, which only match exactly", async () => {
    mockLookups([source({ id: "ks_short", rawText: "Hello, World" })]);

    const [item] = (await checkDuplicates({ drafts: [{ text: "hello world" }] })).items;

    expect(item).toMatchObject({ exists: false, sources: [] });
    expect(findSourcesByExactTextOrKey).toHaveBeenCalledWith(["hello world"], [], undefined, []);
  });

  it("should treat accented letters and digits as part of the comparison", async () => {
    mockLookups([source({ id: "ks_u", rawText: "Über 2 Bücher, ÜBER 2 bücher" })]);

    const [hit, miss] = (
      await checkDuplicates({ drafts: [{ text: "über 2 bücher über 2 bücher" }, { text: "uber 2 bucher uber 2 bucher" }] })
    ).items;

    expect(hit!.exists).toBe(true);
    expect(miss!.exists).toBe(false);
  });

  it("should cap normalized matches at five per kind", async () => {
    mockLookups(Array.from({ length: 9 }, (_, i) => source({ id: `ks_${i}`, rawText: "THE SAME LONG SENTENCE" })));

    const [item] = (await checkDuplicates({ drafts: [{ text: "the same long sentence" }] })).items;

    expect(item!.sources).toHaveLength(CHECK_DUPLICATES_MAX_MATCHES_PER_KIND);
  });

  it("should reject empty lists and more than 100 drafts", () => {
    const draft = { text: "t" };

    expect(checkDuplicatesInputSchema.safeParse({ drafts: [] }).success).toBe(false);
    expect(checkDuplicatesInputSchema.safeParse({ drafts: Array(101).fill(draft) }).success).toBe(false);
    expect(checkDuplicatesInputSchema.safeParse({ drafts: Array(100).fill(draft) }).success).toBe(true);
  });
});
