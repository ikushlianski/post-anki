import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createApprovalSeeders, startApprovalTestDatabase } from "./knowledge-bit-approval.integration-helpers.js";

const database = await startApprovalTestDatabase();
const client = database.client;
const { seedKnowledgeSource, seedKnowledgeBit, seedQuestionVariant } = createApprovalSeeders(client);

const { listPendingKnowledgeBitsForReview } = await import("./knowledge-bit-pending-list.repo.js");
const { editKnowledgeBitQuestionVariant } = await import("./knowledge-bit-approval.repo.js");

afterAll(database.teardown);

describe("listPendingKnowledgeBitsForReview (real Postgres)", () => {
  it("should group pending bits by their knowledge source with their active question variants", async () => {
    const sourceId = await seedKnowledgeSource("The source prose.");
    const bitId = await seedKnowledgeBit(sourceId, 0, "A pending bit", "Some background.");
    await seedQuestionVariant(bitId, "wh_question", 0, "What prompt?", "What answer");
    await seedQuestionVariant(bitId, "fill_in_the_blank", 1, "Fill ___", "blank");

    const sources = await listPendingKnowledgeBitsForReview(100);
    const thisSource = sources.find((source) => source.knowledgeSourceId === sourceId);

    expect(thisSource).toBeDefined();
    expect(thisSource!.sourceText).toBe("The source prose.");
    expect(thisSource!.bits).toHaveLength(1);
    expect(thisSource!.bits[0]!.id).toBe(bitId);
    expect(thisSource!.bits[0]!.background).toBe("Some background.");
    expect(thisSource!.bits[0]!.variants.map((v) => v.prompt).sort()).toEqual(
      ["Fill ___", "What prompt?"].sort(),
    );
  });

  it("should exclude an approved bit and a rejected bit", async () => {
    const sourceId = await seedKnowledgeSource();
    await seedKnowledgeBit(sourceId, 0, "An approved bit", null, "approved");
    await seedKnowledgeBit(sourceId, 1, "A rejected bit", null, "rejected");

    const sources = await listPendingKnowledgeBitsForReview(100);
    const thisSource = sources.find((source) => source.knowledgeSourceId === sourceId);

    expect(thisSource).toBeUndefined();
  });

  it("should return subjectName from linked subject when present", async () => {
    const subjectId = `subj_${randomUUID()}`;

    await client.query(
      `INSERT INTO subjects (id, name, kind) VALUES ($1, 'Physics', 'architecture-mentor')`,
      [subjectId],
    );

    const sourceId = `ksrc_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'prose', 'Some prose.', 'pending', $2)`,
      [sourceId, subjectId],
    );

    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit with subject");

    const sources = await listPendingKnowledgeBitsForReview(100);
    const thisSource = sources.find((source) => source.knowledgeSourceId === sourceId);

    expect(thisSource).toBeDefined();
    expect(thisSource!.subjectName).toBe("Physics");

    await client.query(`DELETE FROM knowledge_bits WHERE id = $1`, [bitId]);
    await client.query(`DELETE FROM knowledge_sources WHERE id = $1`, [sourceId]);
    await client.query(`DELETE FROM subjects WHERE id = $1`, [subjectId]);
  });

  it("should return null subjectName when source has no subject", async () => {
    const sourceId = await seedKnowledgeSource("Prose without subject.");
    await seedKnowledgeBit(sourceId, 0, "A bit without subject");

    const sources = await listPendingKnowledgeBitsForReview(100);
    const thisSource = sources.find((source) => source.knowledgeSourceId === sourceId);

    expect(thisSource).toBeDefined();
    expect(thisSource!.subjectName).toBeNull();
  });

  it("should never include a superseded variant for a pending bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A pending bit");
    const variantId = await seedQuestionVariant(bitId, "wh_question", 0, "Old prompt", "Old answer");

    await editKnowledgeBitQuestionVariant(variantId, "New prompt", "New answer");

    const sources = await listPendingKnowledgeBitsForReview(100);
    const thisSource = sources.find((source) => source.knowledgeSourceId === sourceId);

    expect(thisSource!.bits[0]!.variants).toHaveLength(1);
    expect(thisSource!.bits[0]!.variants[0]!.prompt).toBe("New prompt");
  });

  it("should order pending bits with the same createdAt by id ascending", async () => {
    const sourceId = await seedKnowledgeSource();
    const [lowerId, higherId] = [`kb_tie_${randomUUID()}`, `kb_tie_${randomUUID()}`].sort();
    const sameCreatedAt = "2026-01-01T00:00:00Z";

    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, created_at)
       VALUES ($1, $2, 0, 'Higher id, inserted first', 'pending', $3),
              ($4, $2, 1, 'Lower id, inserted second', 'pending', $3)`,
      [higherId, sourceId, sameCreatedAt, lowerId],
    );

    const sources = await listPendingKnowledgeBitsForReview(100);
    const thisSource = sources.find((source) => source.knowledgeSourceId === sourceId);

    expect(thisSource!.bits.map((bit) => bit.id)).toEqual([lowerId, higherId]);
  });
  it("should page through pending bits with a cursor without repeats or gaps, including bits sharing a timestamp", async () => {
    const sourceId = await seedKnowledgeSource();
    const prefix = `kb_page_${randomUUID()}`;
    const ids = Array.from({ length: 7 }, (_, index) => `${prefix}_${index}`);
    const stamps = [
      "2020-01-01T00:00:00.000001Z",
      "2020-01-01T00:00:00.000001Z",
      "2020-01-01T00:00:00.000002Z",
      "2020-01-01T00:00:01Z",
      "2020-01-01T00:00:01Z",
      "2020-01-01T00:00:01Z",
      "2020-01-01T00:00:02Z",
    ];

    for (const [index, id] of ids.entries()) {
      await client.query(
        `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, created_at)
         VALUES ($1, $2, $3, 'paged', 'pending', $4)`,
        [id, sourceId, index, stamps[index]],
      );
    }

    const seen: string[] = [];
    let cursor: { afterCreatedAt: string; afterId: string } | undefined;

    for (let guard = 0; guard < 10; guard += 1) {
      const sources = await listPendingKnowledgeBitsForReview(3, undefined, undefined, cursor);
      const bits = sources.flatMap((source) => source.bits).filter((bit) => bit.id.startsWith(prefix));
      const all = sources.flatMap((source) => source.bits);

      if (all.length === 0) {
        break;
      }

      seen.push(...bits.map((bit) => bit.id));

      const last = all.map((bit) => ({ afterCreatedAt: bit.createdAt!, afterId: bit.id })).sort((a, b) =>
        `${a.afterCreatedAt}|${a.afterId}`.localeCompare(`${b.afterCreatedAt}|${b.afterId}`),
      ).at(-1)!;

      cursor = last;
    }

    expect(seen).toEqual(ids);
  });

  it("should return a microsecond createdAt on each pending bit so the next page starts exactly after it", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = `kb_us_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, created_at)
       VALUES ($1, $2, 0, 'precise', 'pending', '2021-02-03T04:05:06.123456Z')`,
      [id, sourceId],
    );

    const sources = await listPendingKnowledgeBitsForReview(200, undefined, undefined, {
      afterCreatedAt: "2021-02-03T04:05:06.123455Z",
      afterId: "",
    });
    const bit = sources.flatMap((source) => source.bits).find((candidate) => candidate.id === id);

    expect(bit?.createdAt).toBe("2021-02-03T04:05:06.123456Z");
  });
});
