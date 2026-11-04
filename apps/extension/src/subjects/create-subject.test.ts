import { describe, expect, it, vi } from "vitest";
import { createSubject } from "./create-subject.js";

const reply = (status: number, body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("createSubject", () => {
  it("should refuse a blank name without calling the API", async () => {
    const fetchImpl = vi.fn();

    expect(await createSubject("https://api.test", "t", { name: "  " }, fetchImpl)).toEqual({ ok: false, reason: "empty_name" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("should send the name and parent with the token and return the new subject", async () => {
    const fetchImpl = reply(201, { id: "s1", name: "Tax", parentId: "biz" });
    const result = await createSubject("https://api.test", "t", { name: " Tax ", parentId: "biz" }, fetchImpl);

    expect(result).toEqual({ ok: true, subject: { id: "s1", name: "Tax", parentId: "biz" } });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.test/subjects",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Tax", parentId: "biz" }) }),
    );
  });

  it("should report a rejected token as unauthorized", async () => {
    expect(await createSubject("https://api.test", "bad", { name: "Tax" }, reply(401, {}))).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("should report an unreachable API as a network failure", async () => {
    expect(await createSubject("https://api.test", "t", { name: "Tax" }, vi.fn().mockRejectedValue(new Error("x")))).toEqual({
      ok: false,
      reason: "network",
    });
  });
});
