import { afterAll, describe, expect, it } from "vitest";
import { createApprovalSeeders, startApprovalTestDatabase } from "./knowledge-bit-approval.integration-helpers.js";

const database = await startApprovalTestDatabase();
const client = database.client;
const { seedKnowledgeSource, seedKnowledgeBit, seedQuestionVariant } = createApprovalSeeders(client);

const { editKnowledgeBitQuestionVariant } = await import("./knowledge-bit-approval.repo.js");

afterAll(database.teardown);

describe("editKnowledgeBitQuestionVariant (real Postgres)", () => {
  async function seedWithContext(context: string): Promise<{ bitId: string; variantId: string }> {
    const bitId = await seedKnowledgeBit(await seedKnowledgeSource(), 0, "A bit with context");
    const variantId = await seedQuestionVariant(bitId, "basic", 0, "Old prompt", "Old answer");

    await client.query(`UPDATE knowledge_bit_question_variants SET context = $1 WHERE id = $2`, [context, variantId]);

    return { bitId, variantId };
  }

  async function activeContext(bitId: string): Promise<string | null> {
    const { rows } = await client.query(
      `SELECT context FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1 AND superseded_at IS NULL`,
      [bitId],
    );

    return rows[0]!.context as string | null;
  }

  it("should keep the context when an edit does not mention it", async () => {
    const { bitId, variantId } = await seedWithContext("senior dev talking to their manager");

    await editKnowledgeBitQuestionVariant(variantId, "New prompt", "New answer");

    expect(await activeContext(bitId)).toBe("senior dev talking to their manager");
  });

  it("should replace the context when an edit sends a new one", async () => {
    const { bitId, variantId } = await seedWithContext("old context");

    await editKnowledgeBitQuestionVariant(variantId, "New prompt", "New answer", "  To a client  ");

    expect(await activeContext(bitId)).toBe("To a client");
  });

  it("should clear the context when an edit sends it empty", async () => {
    const { bitId, variantId } = await seedWithContext("old context");

    await editKnowledgeBitQuestionVariant(variantId, "New prompt", "New answer", "");

    expect(await activeContext(bitId)).toBeNull();
  });

  it("should supersede the old variant row and insert a fresh active one with the edited text", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit with a variant");
    const variantId = await seedQuestionVariant(bitId, "wh_question", 0, "Old prompt", "Old answer");

    const result = await editKnowledgeBitQuestionVariant(variantId, "New prompt", "New answer");

    expect(result).toEqual({ ok: true, variantId: expect.any(String), knowledgeBitId: bitId });

    const { rows: oldRows } = await client.query(
      `SELECT prompt, answer, superseded_at FROM knowledge_bit_question_variants WHERE id = $1`,
      [variantId],
    );

    expect(oldRows[0]!.prompt).toBe("Old prompt");
    expect(oldRows[0]!.answer).toBe("Old answer");
    expect(oldRows[0]!.superseded_at).not.toBeNull();

    const newVariantId = (result as { ok: true; variantId: string }).variantId;
    const { rows: newRows } = await client.query(
      `SELECT knowledge_bit_id, kind, "order", prompt, answer, superseded_at
       FROM knowledge_bit_question_variants WHERE id = $1`,
      [newVariantId],
    );

    expect(newRows[0]!.knowledge_bit_id).toBe(bitId);
    expect(newRows[0]!.kind).toBe("wh_question");
    expect(newRows[0]!.order).toBe(0);
    expect(newRows[0]!.prompt).toBe("New prompt");
    expect(newRows[0]!.answer).toBe("New answer");
    expect(newRows[0]!.superseded_at).toBeNull();
  });

  it("should return not_found for a variant id that does not exist", async () => {
    const result = await editKnowledgeBitQuestionVariant("kbqv_missing", "New prompt", "New answer");

    expect(result).toEqual({ error: "not_found" });
  });

  it("should return not_found for a variant that is already superseded", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit with a variant");
    const variantId = await seedQuestionVariant(bitId, "wh_question", 0);

    await editKnowledgeBitQuestionVariant(variantId, "First edit", "First edit answer");
    const secondResult = await editKnowledgeBitQuestionVariant(
      variantId,
      "Second edit",
      "Second edit answer",
    );

    expect(secondResult).toEqual({ error: "not_found" });
  });

  it("should edit an approved bit's variant by superseding it with the new text", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "An approved bit", null, "approved");
    const variantId = await seedQuestionVariant(bitId, "wh_question", 0, "Old prompt", "Old answer");

    const result = await editKnowledgeBitQuestionVariant(variantId, "New prompt", "New answer");

    expect(result).toEqual({ ok: true, variantId: expect.any(String), knowledgeBitId: bitId });

    const { rows } = await client.query(
      `SELECT prompt, answer, superseded_at FROM knowledge_bit_question_variants WHERE id = $1`,
      [variantId],
    );

    expect(rows[0]!.superseded_at).not.toBeNull();
  });

  it("should return blocked and leave the variant untouched for a rejected bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A rejected bit", null, "rejected");
    const variantId = await seedQuestionVariant(bitId, "wh_question", 0, "Old prompt", "Old answer");

    const result = await editKnowledgeBitQuestionVariant(variantId, "New prompt", "New answer");

    expect(result).toEqual({ error: "blocked" });

    const { rows } = await client.query(
      `SELECT prompt, answer, superseded_at FROM knowledge_bit_question_variants WHERE id = $1`,
      [variantId],
    );

    expect(rows[0]!.prompt).toBe("Old prompt");
    expect(rows[0]!.answer).toBe("Old answer");
    expect(rows[0]!.superseded_at).toBeNull();
  });

  it("should still edit normally for a pending bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A pending bit");
    const variantId = await seedQuestionVariant(bitId, "wh_question", 0);

    const result = await editKnowledgeBitQuestionVariant(variantId, "New prompt", "New answer");

    expect(result).toEqual({ ok: true, variantId: expect.any(String), knowledgeBitId: bitId });
  });

  it("should let only one of two concurrent edits on the same variant win", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A pending bit");
    const variantId = await seedQuestionVariant(bitId, "wh_question", 0);

    const [first, second] = await Promise.all([
      editKnowledgeBitQuestionVariant(variantId, "Racer A", "Racer A answer"),
      editKnowledgeBitQuestionVariant(variantId, "Racer B", "Racer B answer"),
    ]);

    const outcomes = [first, second];
    const wins = outcomes.filter((r) => "ok" in r);
    const losses = outcomes.filter((r) => "error" in r);

    expect(wins).toHaveLength(1);
    expect(losses).toEqual([{ error: "not_found" }]);

    const winningVariantId = (wins[0] as { ok: true; variantId: string }).variantId;
    const { rows } = await client.query(
      `SELECT id, prompt, superseded_at FROM knowledge_bit_question_variants
       WHERE knowledge_bit_id = $1 AND kind = 'wh_question' AND "order" = 0`,
      [bitId],
    );

    const active = rows.filter((row) => row.superseded_at === null);

    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe(winningVariantId);
    expect(["Racer A", "Racer B"]).toContain(active[0]!.prompt);
  });
});
