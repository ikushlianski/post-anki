import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { isOpenTodoUnderDirection } from "@post-anki/core";
import { addProjectTodo, fitTodoLine, todoFactoryCliPath } from "./project-todo.destination.js";

const execFileAsync = promisify(execFile);
const target = { file: "/repo/.planning/todo.md", direction: "reading-notes" };

describe("addProjectTodo", () => {
  it("adds the note as a coding task in the target direction via argv only", async () => {
    const run = vi.fn().mockResolvedValue(undefined);

    await addProjectTodo(target, "Call every lost lead within a day; ask why", run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0]).toEqual([
      "add-item",
      "--file",
      "/repo/.planning/todo.md",
      "--direction",
      "reading-notes",
      "--section",
      "Coding tasks",
      "--text",
      "Call every lost lead within a day; ask why",
    ]);
  });

  it("creates the direction first when the target file lacks it, then retries once", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("cli"), { stderr: 'No direction block found for slug "reading-notes"' }))
      .mockResolvedValue(undefined);

    await addProjectTodo(target, "Track churn monthly", run);

    expect(run.mock.calls.map((call) => call[0][0])).toEqual(["add-item", "add-direction", "add-item"]);
    expect(run.mock.calls[1]![0]).toContain("--slug");
    expect(run.mock.calls[1]![0]).toContain("reading-notes");
  });

  it("treats a note already open in the target direction as successfully written", async () => {
    const run = vi.fn().mockRejectedValue(
      Object.assign(new Error("cli"), {
        stderr: 'Item text already exists under direction "reading-notes": "Track churn monthly"',
      }),
    );
    const read = vi.fn().mockResolvedValue(
      "## reading-notes\n\n### Coding tasks\n- [ ] Track churn monthly\n",
    );

    await expect(addProjectTodo(target, "Track churn monthly", run, read)).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("disambiguates a note that only collides with an unrelated line elsewhere in the file", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("cli"), {
          stderr: 'Item text already exists under direction "sales": "Track churn monthly"',
        }),
      )
      .mockResolvedValue(undefined);
    const read = vi.fn().mockResolvedValue(
      "## sales\n\n### Coding tasks\n- [x] Track churn monthly\n\n## reading-notes\n\n### Coding tasks\n",
    );

    await addProjectTodo(target, "Track churn monthly", run, read);

    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1]![0].at(-1)).toBe("Track churn monthly (2)");
  });

  it("gives up after three collisions rather than claiming the note was written", async () => {
    const run = vi.fn().mockRejectedValue(
      Object.assign(new Error("cli"), {
        stderr: 'Item text already exists under direction "sales": "Track churn monthly"',
      }),
    );
    const read = vi.fn().mockResolvedValue("## sales\n\n### Coding tasks\n- [x] Track churn monthly\n");

    await expect(addProjectTodo(target, "Track churn monthly", run, read)).rejects.toThrow("3 collisions");
    expect(run.mock.calls.map((call) => call[0].at(-1))).toEqual([
      "Track churn monthly",
      "Track churn monthly (2)",
      "Track churn monthly (3)",
    ]);
  });

  it("surfaces any other CLI refusal instead of retrying", async () => {
    const run = vi.fn().mockRejectedValue(Object.assign(new Error("cli"), { stderr: "Text matches a banned log-entry pattern" }));

    await expect(addProjectTodo(target, "x", run)).rejects.toThrow("cli");
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("fitTodoLine", () => {
  it("keeps a short note intact and collapses whitespace", () => {
    expect(fitTodoLine("  Follow up\n with   the lead ")).toBe("Follow up with the lead");
  });

  it("cuts a long note to what the backlog accepts once its checkbox prefix is added", () => {
    const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");

    expect(fitTodoLine(long).split(" ")).toHaveLength(17);
  });

  it("cuts a note with very long words to the character cap", () => {
    const line = fitTodoLine("a".repeat(400));

    expect(line.length).toBeLessThanOrEqual(154);
    expect(line.endsWith("…")).toBe(true);
  });

  it.skipIf(!existsSync(todoFactoryCliPath()))(
    "produces lines the real backlog CLI accepts for over-long word and character inputs",
    async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "todo-fit-"));
      const file = path.join(dir, "todo.md");
      const cli = todoFactoryCliPath();

      await writeFile(file, "# Todo\n");
      await execFileAsync(process.execPath, [
        cli, "add-direction", "--file", file, "--slug", "reading-notes",
        "--scope", "Reading notes", "--out-of-scope", "Everything else",
      ]);

      const manyWords = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
      const longWords = Array.from({ length: 12 }, (_, i) => `${"x".repeat(20)}${i}`).join(" ");

      for (const text of [manyWords, longWords]) {
        await expect(
          execFileAsync(process.execPath, [
            cli, "add-item", "--file", file, "--direction", "reading-notes",
            "--section", "Coding tasks", "--text", fitTodoLine(text),
          ]),
        ).resolves.toBeDefined();
      }
    },
  );

  it.skipIf(!existsSync(todoFactoryCliPath()))(
    "adds a disambiguated line when the same text is already checked off under another direction",
    async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "todo-collide-"));
      const file = path.join(dir, "todo.md");
      const cli = todoFactoryCliPath();
      const run = (args: string[]) => execFileAsync(process.execPath, [cli, ...args]).then(() => undefined);

      await writeFile(file, "# Todo\n");
      await run(["add-direction", "--file", file, "--slug", "sales", "--scope", "Sales", "--out-of-scope", "Else"]);
      await run(["add-item", "--file", file, "--direction", "sales", "--section", "Coding tasks", "--text", "Track churn monthly"]);
      await run(["mark-done", "--file", file, "--direction", "sales", "--item", "Track churn monthly", "--no-citation-reason", "test"]);
      await run(["add-direction", "--file", file, "--slug", "reading-notes", "--scope", "Reading notes", "--out-of-scope", "Else"]);

      await addProjectTodo({ file, direction: "reading-notes" }, "Track churn monthly", run);

      const written = await readFile(file, "utf8");

      expect(isOpenTodoUnderDirection(written, "reading-notes", "Track churn monthly (2)")).toBe(true);
      expect(isOpenTodoUnderDirection(written, "reading-notes", "Track churn monthly")).toBe(false);
    },
  );
});
