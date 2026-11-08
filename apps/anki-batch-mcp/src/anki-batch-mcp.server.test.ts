import { copyFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAnkiBatchServer } from "./anki-batch.server-factory.js";

type Note = { hash: string; deck: string | null; front: string; back: string; rawText: string };
type Batch = { batchId: string; remaining: number; notes: Note[] };

let file: string;
let client: Client;

async function call<T>(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });

  return { isError: result.isError, data: result.structuredContent as T };
}

async function callRejected(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args }).catch(() => ({ isError: true }));

  return result.isError === true;
}

beforeEach(async () => {
  file = join(mkdtempSync(join(tmpdir(), "anki-server-")), "export.txt");
  copyFileSync(new URL("./test-fixtures/small-export.txt", import.meta.url), file);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([createAnkiBatchServer(file).connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
});

describe("anki-batch server", () => {
  it("should expose exactly get_next_batch, confirm_batch and status", async () => {
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual(["confirm_batch", "get_next_batch", "status"]);
  });

  it("should report status without creating a backup", async () => {
    const { data } = await call<{ backupExists: boolean; remaining: number }>("status");

    expect(data).toMatchObject({ backupExists: false, remaining: 7, pendingBatches: 0 });
    expect(existsSync(`${file}.bak`)).toBe(false);
  });

  it("should hand out non-overlapping batches and back the file up first", async () => {
    const first = (await call<Batch>("get_next_batch", { size: 3 })).data;
    const second = (await call<Batch>("get_next_batch", { size: 3 })).data;
    const overlap = first.notes.filter((a) => second.notes.some((b) => b.hash === a.hash));

    expect(first.notes).toHaveLength(3);
    expect(first.notes[0]).toMatchObject({ deck: "Основы", front: "Что такое выручка" });
    expect(existsSync(`${file}.bak`)).toBe(true);
    expect(second.notes).toHaveLength(3);
    expect(overlap).toEqual([]);
    expect(first.batchId).not.toBe(second.batchId);
  });

  it("should remove exactly the confirmed batch and keep the headers", async () => {
    const batch = (await call<Batch>("get_next_batch", { size: 3 })).data;
    const confirmed = await call<{ removed: number; remaining: number }>("confirm_batch", {
      batchId: batch.batchId,
    });
    const text = readFileSync(file, "utf8");

    expect(confirmed.data).toEqual({ removed: 3, remaining: 4 });
    expect(text.startsWith("#separator:tab\n#html:true\n")).toBe(true);
    expect(text).not.toContain("Что такое выручка");
    expect(text).toContain("Клиент возвращается");
  });

  it("should refuse unknown and repeated batch ids", async () => {
    const batch = (await call<Batch>("get_next_batch", { size: 2 })).data;

    expect((await call("confirm_batch", { batchId: "unknown" })).isError).toBe(true);
    await call("confirm_batch", { batchId: batch.batchId });
    expect((await call("confirm_batch", { batchId: batch.batchId })).isError).toBe(true);
    expect((await call<{ remaining: number }>("status")).data.remaining).toBe(5);
  });

  it("should reject batch sizes outside 1 to 50", async () => {
    expect(await callRejected("get_next_batch", { size: 0 })).toBe(true);
    expect(await callRejected("get_next_batch", { size: 51 })).toBe(true);
  });
});
