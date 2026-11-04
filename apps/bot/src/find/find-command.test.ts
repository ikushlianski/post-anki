import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResponse } from "@post-anki/shared";
import { FIND_UNREACHABLE_REPLY, handleFindCommand } from "./find-command.handler.js";
import { FIND_USAGE_REPLY, formatFindReply } from "./find-command.js";

const EMPTY: SearchResponse = { subjects: [], curricula: [], topics: [] };

function hit(): SearchResponse {
  return {
    subjects: [{ id: "s1", label: "Kubernetes" }],
    curricula: [{ id: "c1", label: "Kubernetes basics" }],
    topics: [
      { id: "t1", label: "Pods", curriculumId: "c1" },
      { id: "t2", label: "Services", curriculumId: "c1" },
      { id: "t3", label: "Ingress", curriculumId: "c1" },
      { id: "t4", label: "Volumes", curriculumId: "c1" },
    ],
  } as SearchResponse;
}

describe("handleFindCommand", () => {
  const sendMessage = vi.fn<(chatId: number, text: string) => Promise<void>>();

  beforeEach(() => {
    sendMessage.mockReset().mockResolvedValue(undefined);
  });

  it("should reply with the top 5 matches and a Find page link when the search hits", async () => {
    const search = vi.fn().mockResolvedValue(hit());
    await handleFindCommand(7, " kubernetes ", { search, sendMessage, webBaseUrl: "https://web.example/" });
    expect(search).toHaveBeenCalledWith("kubernetes");
    const text = sendMessage.mock.calls[0]![1];
    expect(text).toContain("Kubernetes basics");
    expect(text).toContain("Ingress");
    expect(text).not.toContain("Volumes");
    expect(text).toContain("and 1 more");
    expect(text.endsWith("https://web.example/find")).toBe(true);
  });

  it("should say nothing was found when the search is empty", async () => {
    const search = vi.fn().mockResolvedValue(EMPTY);
    await handleFindCommand(7, "zzz", { search, sendMessage });
    expect(sendMessage).toHaveBeenCalledWith(7, 'Nothing found for "zzz".');
  });

  it("should send usage text without searching when no words are given", async () => {
    const search = vi.fn();
    await handleFindCommand(7, "   ", { search, sendMessage });
    expect(search).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(7, FIND_USAGE_REPLY);
  });

  it("should send a friendly reply when the API fails", async () => {
    const search = vi.fn().mockRejectedValue(new Error("boom"));
    await handleFindCommand(7, "pods", { search, sendMessage });
    expect(sendMessage).toHaveBeenCalledWith(7, FIND_UNREACHABLE_REPLY);
  });
});

describe("formatFindReply", () => {
  it("should omit the link when no web base URL is configured", () => {
    expect(formatFindReply("a", hit())).not.toContain("http");
  });

  it("should clip long labels without splitting an emoji", () => {
    const label = `${"a".repeat(79)}😀tail`;
    const text = formatFindReply("a", { ...EMPTY, subjects: [{ id: "s", label }] });
    expect(() => encodeURIComponent(text)).not.toThrow();
    expect(text).not.toContain("tail");
  });
});
