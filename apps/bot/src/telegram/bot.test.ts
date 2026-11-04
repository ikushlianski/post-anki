import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  editMessageText: vi.fn(),
}));

vi.mock("grammy", () => ({ Bot: class { api = api; } }));
vi.mock("../env.js", () => ({ loadEnv: () => ({ TELEGRAM_BOT_TOKEN: "t" }) }));

import { TELEGRAM_MAX_MESSAGE_CHARS, editMessageText, sendMessage } from "./bot.js";

beforeEach(() => {
  api.sendMessage.mockReset();
  api.editMessageText.mockReset();
});

describe("sendMessage", () => {
  it("should cut a too-long message to Telegram's limit with an ellipsis", async () => {
    await sendMessage(1, "a".repeat(5000));

    const text = api.sendMessage.mock.calls[0]![1] as string;

    expect(text).toHaveLength(TELEGRAM_MAX_MESSAGE_CHARS);
    expect(text.endsWith("…")).toBe(true);
  });

  it("should not split an emoji sitting at the cut", async () => {
    await sendMessage(1, `${"a".repeat(TELEGRAM_MAX_MESSAGE_CHARS - 2)}😀😀`);

    const text = api.sendMessage.mock.calls[0]![1] as string;

    expect(() => encodeURIComponent(text)).not.toThrow();
    expect(text.length).toBeLessThanOrEqual(TELEGRAM_MAX_MESSAGE_CHARS);
  });

  it("should leave a short message unchanged", async () => {
    await sendMessage(1, "hi");

    expect(api.sendMessage).toHaveBeenCalledWith(1, "hi");
  });
});

describe("editMessageText", () => {
  it("should cut a too-long edit to Telegram's limit", async () => {
    await editMessageText(1, 2, "a".repeat(5000));

    expect((api.editMessageText.mock.calls[0]![2] as string).length).toBe(TELEGRAM_MAX_MESSAGE_CHARS);
  });

  it("should ignore Telegram's 'message is not modified' error so a double tap does not break the screen", async () => {
    api.editMessageText.mockRejectedValue(new Error("Bad Request: message is not modified: same content"));

    await expect(editMessageText(1, 2, "same")).resolves.toBeUndefined();
  });

  it("should still raise any other edit error", async () => {
    api.editMessageText.mockRejectedValue(new Error("Bad Request: chat not found"));

    await expect(editMessageText(1, 2, "x")).rejects.toThrow("chat not found");
  });
});
