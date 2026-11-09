import { describe, expect, it } from "vitest";
import { createChatQueueProposalSink } from "../knowledge-bit/knowledge-bit-chat-queue-proposal-sink.js";
import { createChatQueueProposalTools, proposalToolInputSchema } from "./knowledge-bit-chat-queue-proposal-tools.js";

type Executable = { execute: (input: unknown, ctx: unknown) => Promise<unknown> };

const run = (tool: unknown, input: unknown) => (tool as Executable).execute(input, {});

describe("createChatQueueProposalTools", () => {
  it("should record a proposal and say it is not saved", async () => {
    const sink = createChatQueueProposalSink();
    const tools = createChatQueueProposalTools({ sink, allowUpdate: true });

    const out = await run(tools.proposeNewCard, { front: "Q", back: "A" });

    expect(out).toMatchObject({ ok: true });
    expect(JSON.stringify(out)).toContain("NOT saved");
    expect(sink.list()).toEqual([expect.objectContaining({ kind: "create", status: "pending" })]);
  });

  it("should record an update proposal as kind update", async () => {
    const sink = createChatQueueProposalSink();
    const tools = createChatQueueProposalTools({ sink, allowUpdate: true });

    await run(tools.proposeCardUpdate, { front: "Q", back: "A", reason: "clearer" });

    expect(sink.list()[0]).toMatchObject({ kind: "update", reason: "clearer" });
  });

  it("should return an actionable error once the reply limit is reached", async () => {
    const sink = createChatQueueProposalSink();
    const tools = createChatQueueProposalTools({ sink, allowUpdate: true });

    await run(tools.proposeNewCard, { front: "Q1", back: "A1" });
    await run(tools.proposeNewCard, { front: "Q2", back: "A2" });

    const out = (await run(tools.proposeNewCard, { front: "Q3", back: "A3" })) as { ok: boolean; error: string };

    expect(out.ok).toBe(false);
    expect(out.error).toContain("in text");
  });

  it("should not offer the update tool when the card is not in chat state", () => {
    const tools = createChatQueueProposalTools({ sink: createChatQueueProposalSink(), allowUpdate: false });

    expect(Object.keys(tools)).toEqual(["proposeNewCard"]);
  });

  it("should reject empty, oversized or unknown fields before anything is recorded", () => {
    expect(proposalToolInputSchema.safeParse({ front: " ", back: "A" }).success).toBe(false);
    expect(proposalToolInputSchema.safeParse({ front: "Q", back: "A".repeat(5000) }).success).toBe(false);
    expect(proposalToolInputSchema.safeParse({ front: "Q", back: "A", reason: "r".repeat(201) }).success).toBe(false);
    expect(proposalToolInputSchema.safeParse({ front: "Q", back: "A", save: true }).success).toBe(false);
    expect(proposalToolInputSchema.safeParse({ front: "Q", back: "A" }).success).toBe(true);
  });

  it("should return ok:false with fix guidance when a proposed card is invalid", async () => {
    const sink = createChatQueueProposalSink([], "Source text here.");
    const tools = createChatQueueProposalTools({ sink, allowUpdate: false });

    const out = await run(tools.proposeNewCard, { front: "Is this good?", back: "Yes" });

    expect(out).toMatchObject({ ok: false, error: expect.stringContaining("yes/no") });
  });
});
