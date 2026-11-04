import { afterAll, describe, expect, it } from "vitest";
import { createApprovalSeeders, startApprovalTestDatabase } from "./knowledge-bit-approval.integration-helpers.js";

const database = await startApprovalTestDatabase();
const client = database.client;
const { seedKnowledgeSource, seedKnowledgeBit, seedQuestionVariant } = createApprovalSeeders(client);

const {
  approveKnowledgeBit,
  rejectKnowledgeBit,
} = await import("./knowledge-bit-approval.repo.js");

afterAll(database.teardown);

describe("approveKnowledgeBit (real Postgres)", () => {
  it("should flip a pending bit's approvalState to approved and change nothing else", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit to approve", "Some background.");

    await seedQuestionVariant(id, "basic", 0);

    const approved = await approveKnowledgeBit(id);

    expect(approved).toBe(true);

    const { rows } = await client.query(
      `SELECT approval_state, body, background FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.approval_state).toBe("approved");
    expect(rows[0]!.body).toBe("A bit to approve");
    expect(rows[0]!.background).toBe("Some background.");
  });

  it("should return not_found for a knowledge bit id that does not exist", async () => {
    const approved = await approveKnowledgeBit("kb_missing");

    expect(approved).toBe("not_found");
  });

  it("should return blocked and leave the state untouched for an already-rejected bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "Already rejected", null, "rejected");

    const approved = await approveKnowledgeBit(id);

    expect(approved).toBe("blocked");

    const { rows } = await client.query(
      `SELECT approval_state FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.approval_state).toBe("rejected");
  });

  it("should return true on a retried approve of a bit that is already approved", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "Already approved", null, "approved");

    const approved = await approveKnowledgeBit(id);

    expect(approved).toBe(true);
  });

  it("should return no_variant when the bit has no active variants after a body edit", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A pending bit");

    const approved = await approveKnowledgeBit(id);

    expect(approved).toBe("no_variant");
  });
});

describe("rejectKnowledgeBit (real Postgres)", () => {
  it("should flip a pending bit's approvalState to rejected, keeping the row", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit to reject");

    const rejected = await rejectKnowledgeBit(id);

    expect(rejected.ok).toBe(true);

    const { rows } = await client.query(
      `SELECT approval_state FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.approval_state).toBe("rejected");
  });

  it("should return false for a knowledge bit id that does not exist", async () => {
    const rejected = await rejectKnowledgeBit("kb_missing");

    expect(rejected.ok).toBe(false);
  });

  it("should return false and leave the state untouched for an already-approved bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "Already approved", null, "approved");

    const rejected = await rejectKnowledgeBit(id);

    expect(rejected.ok).toBe(false);

    const { rows } = await client.query(
      `SELECT approval_state FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.approval_state).toBe("approved");
  });

  it("should return true on a retried reject of a bit that is already rejected", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "Already rejected", null, "rejected");

    const rejected = await rejectKnowledgeBit(id);

    expect(rejected.ok).toBe(true);
  });

  it("should clear topicId when rejecting a bit that was already placed", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A placed bit");

    await client.query(`UPDATE knowledge_bits SET topic_id = 'topic_abc' WHERE id = $1`, [id]);

    const rejected = await rejectKnowledgeBit(id);

    expect(rejected.ok).toBe(true);

    const { rows } = await client.query(
      `SELECT topic_id FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.topic_id).toBeNull();
  });
});
