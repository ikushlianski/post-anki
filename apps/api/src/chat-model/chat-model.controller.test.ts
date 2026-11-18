import type http from "node:http";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_KNOWLEDGE_ITEM_MODEL_ID, KNOWLEDGE_ITEM_MODELS } from "@post-anki/shared";
import { handleListChatModels, listChatModels } from "./chat-model.controller.js";

function fakeRes() {
  const res = { writeHead: vi.fn(), end: vi.fn() };

  return res as unknown as http.ServerResponse & typeof res;
}

describe("handleListChatModels", () => {
  it("should answer 200 with a short curated list where exactly the default is flagged", () => {
    const res = fakeRes();

    handleListChatModels(res);

    const body = JSON.parse(res.end.mock.calls[0]?.[0] as string) as ReturnType<typeof listChatModels>;

    expect(res.writeHead.mock.calls[0]?.[0]).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(4);
    expect(body.length).toBeLessThanOrEqual(5);
    expect(body.filter((entry) => entry.isDefault).map((entry) => entry.id)).toEqual([DEFAULT_KNOWLEDGE_ITEM_MODEL_ID]);
  });

  it("should offer a cheap, a mid and a premium choice so the learner can trade cost for quality", () => {
    const tiers = new Set(listChatModels().map((entry) => entry.costTier));

    expect(tiers).toEqual(new Set(["cheap", "mid", "premium"]));
  });

  it("should expose the exact fields the apps render and nothing else", () => {
    const [first] = listChatModels();

    expect(Object.keys(first ?? {}).sort()).toEqual(["costTier", "expiresOn", "id", "isDefault", "label", "note"]);
  });

  it("should leave out models that are not curated for chat", () => {
    const ids = listChatModels().map((entry) => entry.id);

    expect(ids).not.toContain("openrouter/openai/gpt-4.1-nano");
    expect(ids.every((id) => KNOWLEDGE_ITEM_MODELS[id].chatPickable)).toBe(true);
  });

  it("should drop a model once its expiry date has passed", () => {
    const expiring = Object.values(KNOWLEDGE_ITEM_MODELS).find((option) => option.chatPickable && !option.expiresOn);
    const original = expiring?.expiresOn;

    if (!expiring) {
      throw new Error("no pickable model");
    }

    expiring.expiresOn = "2026-01-01";

    try {
      expect(listChatModels(new Date("2026-06-01T00:00:00Z")).map((entry) => entry.id)).not.toContain(expiring.id);
      expect(listChatModels(new Date("2025-06-01T00:00:00Z")).map((entry) => entry.id)).toContain(expiring.id);
    } finally {
      expiring.expiresOn = original ?? null;
    }
  });
});
