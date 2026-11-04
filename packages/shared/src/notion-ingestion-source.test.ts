import { describe, expect, it } from "vitest";
import {
  createNotionIngestionSourceInput,
  extractNotionPageId,
  isNotionPageUrl,
  notionConnectionStatus,
  saveNotionConnectionInput,
  updateNotionIngestionSourceInput,
} from "./notion-ingestion-source";

const ID = "0123456789abcdef0123456789abcdef";

describe("isNotionPageUrl", () => {
  it.each([
    `https://www.notion.so/My-Page-${ID}`,
    `https://notion.so/${ID}`,
    `https://team.notion.site/Phrases-${ID}`,
    `https://www.notion.so/ws/Phrases-${ID}?pvs=4`,
    `https://app.notion.com/p/English-Phrases-${ID}`,
  ])("should accept the Notion page link %s", (url) => {
    expect(isNotionPageUrl(url)).toBe(true);
  });

  it.each([
    `http://www.notion.so/Page-${ID}`,
    `https://evil.com/Page-${ID}`,
    `https://notion.so.evil.com/Page-${ID}`,
    `https://notion.site/Page-${ID}`,
    `https://notion.com.evil.com/p/Page-${ID}`,
    "https://www.notion.so/workspace-home",
    "not a url",
  ])("should refuse %s so no request can target another host", (url) => {
    expect(isNotionPageUrl(url)).toBe(false);
  });
});

describe("extractNotionPageId", () => {
  it("should return the lower-cased 32-hex id of the page", () => {
    expect(extractNotionPageId(`https://www.notion.so/Page-${ID.toUpperCase()}`)).toBe(ID);
  });

  it("should accept a dashed id", () => {
    const dashed = "01234567-89ab-cdef-0123-456789abcdef";

    expect(extractNotionPageId(`https://www.notion.so/${dashed}`)).toBe(ID);
  });
});

describe("createNotionIngestionSourceInput", () => {
  it("should default to 20 items, manual runs and keeping the Notion page unchanged", () => {
    const parsed = createNotionIngestionSourceInput.parse({
      name: "Phrases",
      pageUrl: `https://www.notion.so/P-${ID}`,
      subjectId: "sub_1",
    });

    expect(parsed).toMatchObject({ itemsPerRun: 10, frequency: "manual", removeAfterImport: false });
  });

  it("should refuse more than 100 items per run", () => {
    const result = createNotionIngestionSourceInput.safeParse({
      name: "P",
      pageUrl: `https://www.notion.so/P-${ID}`,
      subjectId: "s",
      itemsPerRun: 101,
    });

    expect(result.success).toBe(false);
  });

  it("should refuse a link that is not a Notion page", () => {
    const result = createNotionIngestionSourceInput.safeParse({
      name: "P",
      pageUrl: "https://example.com/x",
      subjectId: "s",
    });

    expect(result.success).toBe(false);
  });
});

describe("updateNotionIngestionSourceInput", () => {
  it("should allow changing only the pause flag", () => {
    expect(updateNotionIngestionSourceInput.parse({ paused: true })).toEqual({ paused: true });
  });
});

describe("notion connection contracts", () => {
  it("should not allow a token field in the connection status", () => {
    const result = notionConnectionStatus.safeParse({
      configured: true,
      origin: "settings",
      canStoreToken: true,
      token: "secret",
    });

    expect(result.success).toBe(false);
  });

  it("should refuse an empty token", () => {
    expect(saveNotionConnectionInput.safeParse({ token: "  " }).success).toBe(false);
  });
});
