import { describe, expect, it, vi } from "vitest";
import { buildBotCommands, registerBotCommands } from "./register-commands.js";

describe("buildBotCommands", () => {
  it("should offer only slash commands, without the slash or argument hints", () => {
    const names = buildBotCommands().map((entry) => entry.command);

    expect(names).toContain("chat");
    expect(names).toContain("rejected");
    expect(names.every((name) => /^[a-z0-9_]{1,32}$/.test(name))).toBe(true);
    expect(names).not.toContain("skip");
  });
});

describe("registerBotCommands", () => {
  it("should hand the command list to Telegram on startup", async () => {
    const setMyCommands = vi.fn().mockResolvedValue(true);

    await expect(registerBotCommands(setMyCommands)).resolves.toBe(true);
    expect(setMyCommands).toHaveBeenCalledWith(buildBotCommands());
  });

  it("should swallow a Telegram failure so startup keeps going", async () => {
    const setMyCommands = vi.fn().mockRejectedValue(new Error("telegram down"));

    await expect(registerBotCommands(setMyCommands)).resolves.toBe(false);
  });
});
