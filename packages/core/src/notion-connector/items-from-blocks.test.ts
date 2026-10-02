import { describe, expect, it } from "vitest";
import { itemsFromBlocks } from "./items-from-blocks.js";

const EDITED_AT = "2026-10-01T00:00:00.000Z";

function textBlock(id: string, type: string, text: string) {
  return { id, type, last_edited_time: EDITED_AT, [type]: { rich_text: [{ plain_text: text }] } };
}

describe("itemsFromBlocks", () => {
  it("turns each text block into an item carrying its leading tag", () => {
    const items = itemsFromBlocks([
      textBlock("b1", "paragraph", "#SPA Debounce user input"),
      textBlock("b2", "bulleted_list_item", "[CRM] Ask about renewal"),
      textBlock("b3", "to_do", "Untagged reminder"),
    ]);

    expect(items).toEqual([
      { id: "b1", text: "Debounce user input", tags: ["SPA"], lastEditedTime: EDITED_AT },
      { id: "b2", text: "Ask about renewal", tags: ["CRM"], lastEditedTime: EDITED_AT },
      { id: "b3", text: "Untagged reminder", tags: [], lastEditedTime: EDITED_AT },
    ]);
  });

  it("skips empty and non-text blocks", () => {
    const items = itemsFromBlocks([
      textBlock("empty", "paragraph", "   "),
      { id: "img", type: "image", last_edited_time: EDITED_AT, image: { file: { url: "x" } } },
      textBlock("ok", "quote", "Quoted"),
    ]);

    expect(items.map((item) => item.id)).toEqual(["ok"]);
  });

  it("joins multi-part rich text into one line", () => {
    const items = itemsFromBlocks([
      {
        id: "b",
        type: "paragraph",
        last_edited_time: EDITED_AT,
        paragraph: { rich_text: [{ plain_text: "SPA: " }, { plain_text: "bold " }, { plain_text: "tail" }] },
      },
    ]);

    expect(items[0]).toEqual({ id: "b", text: "bold tail", tags: ["SPA"], lastEditedTime: EDITED_AT });
  });
});
