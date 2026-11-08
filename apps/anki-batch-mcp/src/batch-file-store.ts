import { constants } from "node:fs";
import { copyFile, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { parseAnkiExport, type ParsedExport } from "./anki-export-parser.js";

export type BatchFileStore = {
  read(): Promise<ParsedExport>;
  ensureBackup(): Promise<boolean>;
  backupExists(): Promise<boolean>;
  removeByHashes(hashes: Set<string>): Promise<{ removed: number; remaining: number }>;
};

function withNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

export function createBatchFileStore(path: string): BatchFileStore {
  const backupPath = `${path}.bak`;
  const tmpPath = `${path}.tmp`;

  async function read() {
    return parseAnkiExport(await readFile(path, "utf8"));
  }

  async function ensureBackup() {
    try {
      await copyFile(path, backupPath, constants.COPYFILE_EXCL);

      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;

      throw error;
    }
  }

  async function backupExists() {
    return stat(backupPath).then(
      () => true,
      () => false,
    );
  }

  async function removeByHashes(hashes: Set<string>) {
    await ensureBackup();

    const { headerLines, notes } = await read();
    const kept = notes.filter((note) => !hashes.has(note.hash));
    const content =
      headerLines.map((line) => `${line}\n`).join("") +
      kept.map((note) => withNewline(note.source)).join("");

    try {
      await writeFile(tmpPath, content, "utf8");
      await rename(tmpPath, path);
    } catch (error) {
      await rm(tmpPath, { force: true });

      throw error;
    }

    return { removed: notes.length - kept.length, remaining: kept.length };
  }

  return { read, ensureBackup, backupExists, removeByHashes };
}
