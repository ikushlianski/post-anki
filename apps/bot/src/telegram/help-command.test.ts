import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyText, RECOGNIZED_COMMANDS } from "../conversation/reply.js";
import { HELP_COMMANDS, HELP_TEXT } from "./help-command.js";

describe("help command text", () => {
  it.each(RECOGNIZED_COMMANDS)("should mention %s so users can discover it", (keyword) => {
    expect(HELP_TEXT).toContain(keyword);
  });

  it("should describe every command on a single line", () => {
    for (const entry of HELP_COMMANDS) {
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.description).not.toContain("\n");
    }
  });

  it("should only list slash commands the bot actually recognizes", () => {
    for (const entry of HELP_COMMANDS.filter((item) => item.command.startsWith("/"))) {
      const keyword = entry.command.split(" ")[0]!;

      expect(RECOGNIZED_COMMANDS).toContain(keyword);
      expect(classifyText(keyword).kind).not.toBe("process");
    }
  });

  it("should classify /help as a help request", () => {
    expect(classifyText("/help").kind).toBe("help");
  });

  it("should list every help command in the README command table", () => {
    const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");

    const escapeCell = (value: string) => value.replace(/\|/g, "\\|");

    for (const entry of HELP_COMMANDS) {
      expect(readme).toContain(`| \`${escapeCell(entry.command)}\` |`);
    }
  });
});
