import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { readLimitedBody } from "./read-limited-body.js";

function request(...parts: string[]): IncomingMessage {
  return Readable.from(parts.map((p) => Buffer.from(p))) as unknown as IncomingMessage;
}

describe("readLimitedBody", () => {
  it("should return the whole body when it fits under the limit", async () => {
    const onTooLarge = vi.fn();

    const body = await readLimitedBody(request("{\"a\":", "1}"), 100, onTooLarge);

    expect(body?.toString("utf8")).toBe('{"a":1}');
    expect(onTooLarge).not.toHaveBeenCalled();
  });

  it("should stop reading and signal rejection when the body exceeds the limit", async () => {
    const onTooLarge = vi.fn();

    const body = await readLimitedBody(request("12345", "67890"), 8, onTooLarge);

    expect(body).toBeNull();
    expect(onTooLarge).toHaveBeenCalledTimes(1);
  });
});
