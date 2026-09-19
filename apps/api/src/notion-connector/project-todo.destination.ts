import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { isOpenTodoUnderDirection } from "@post-anki/core";

const execFileAsync = promisify(execFile);

// The CLI validates after prepending "- [ ] " (3 words, 6 chars) to its own 20/160 cap.
const MAX_WORDS = 17;
const MAX_CHARS = 154;
const MAX_COLLISION_ATTEMPTS = 3;
const MISSING_DIRECTION = /No direction block found for slug/;
const ALREADY_EXISTS = /Item text already exists under/;

export interface ProjectTodoTarget {
  file: string;
  direction: string;
}

export type TodoCliRunner = (args: string[]) => Promise<void>;
export type TodoFileReader = (file: string) => Promise<string>;

export function todoFactoryCliPath(): string {
  return process.env.TODO_FACTORY_CLI ?? path.join(os.homedir(), ".claude/skills/todo-factory/cli.ts");
}

export function fitTodoLine(text: string, reserve = 0): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  const words = oneLine.split(" ").slice(0, MAX_WORDS).join(" ");
  const maxChars = MAX_CHARS - reserve;

  return words.length <= maxChars ? words : `${words.slice(0, maxChars - 1).trimEnd()}…`;
}

export async function runTodoCli(args: string[]): Promise<void> {
  await execFileAsync(process.execPath, [todoFactoryCliPath(), ...args]);
}

function refusalOf(err: unknown): string {
  return String((err as { stderr?: string }).stderr ?? err);
}

function addItemArgs(target: ProjectTodoTarget, text: string): string[] {
  return [
    "add-item",
    "--file",
    target.file,
    "--direction",
    target.direction,
    "--section",
    "Coding tasks",
    "--text",
    text,
  ];
}

function addDirectionArgs(target: ProjectTodoTarget): string[] {
  return [
    "add-direction",
    "--file",
    target.file,
    "--slug",
    target.direction,
    "--scope",
    "Notes captured while reading, tagged for this project in Notion",
    "--out-of-scope",
    "Anything not captured from the Notion reading inbox",
  ];
}

// A collision suffix like " (2)" is one extra word and up to 4 chars; each attempt refits the base text.
function candidateText(text: string, attempt: number): string {
  if (attempt === 1) {
    return fitTodoLine(text);
  }

  const suffix = ` (${attempt})`;
  const base = fitTodoLine(text, suffix.length);

  return base.split(" ").length >= MAX_WORDS
    ? `${base.split(" ").slice(0, MAX_WORDS - 1).join(" ")}${suffix}`
    : `${base}${suffix}`;
}

export async function addProjectTodo(
  target: ProjectTodoTarget,
  text: string,
  run: TodoCliRunner = runTodoCli,
  read: TodoFileReader = (file) => readFile(file, "utf8"),
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_COLLISION_ATTEMPTS; attempt += 1) {
    const candidate = candidateText(text, attempt);

    try {
      await run(addItemArgs(target, candidate));
      return;
    } catch (err) {
      const refusal = refusalOf(err);

      if (MISSING_DIRECTION.test(refusal)) {
        await run(addDirectionArgs(target));
        await run(addItemArgs(target, candidate));
        return;
      }

      if (!ALREADY_EXISTS.test(refusal)) {
        throw err;
      }

      if (isOpenTodoUnderDirection(await read(target.file), target.direction, candidate)) {
        return;
      }
    }
  }

  throw new Error(`Could not add note to ${target.file} after ${MAX_COLLISION_ATTEMPTS} collisions`);
}
