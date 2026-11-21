import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReq, fakeRes } from "../shared/fake-http.test-mocks.js";
import { resolveRoute } from "../router.js";

const sendMeAgentTodo = vi.fn();

vi.mock("./me-agent.client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./me-agent.client.js")>()),
  sendMeAgentTodo: (...args: unknown[]) => sendMeAgentTodo(...args),
}));

const { handleCreateMeAgentTodo } = await import("./me-agent-todo.controller.js");

describe("create me agent todo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should expose the route behind the shared authenticated router", () => {
    expect(resolveRoute("POST", "/me-agent/todos")?.name).toBe("createMeAgentTodo");
  });

  it("should answer 201 and forward the trimmed todo when it is sent", async () => {
    sendMeAgentTodo.mockResolvedValue({ ok: true });
    const res = fakeRes();

    await handleCreateMeAgentTodo(fakeReq(JSON.stringify({ text: "  Buy milk  " })), res);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ sent: true });
    expect(sendMeAgentTodo).toHaveBeenCalledWith({ text: "Buy milk" });
  });

  it.each([[{}], [{ text: "   " }], [{ text: "a".repeat(2001) }], [{ text: "a", title: "" }]])(
    "should reject invalid input %j with 400 and not call out",
    async (payload) => {
      const res = fakeRes();

      await handleCreateMeAgentTodo(fakeReq(JSON.stringify(payload)), res);

      expect(res.status).toBe(400);
      expect(sendMeAgentTodo).not.toHaveBeenCalled();
    },
  );

  it("should answer 503 with a stable code when the Me agent is not configured", async () => {
    sendMeAgentTodo.mockResolvedValue({ ok: false, reason: "not_configured" });
    const res = fakeRes();

    await handleCreateMeAgentTodo(fakeReq(JSON.stringify({ text: "a" })), res);

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: "me_agent_not_configured" });
  });

  it("should answer a plain 502 without URL or stack when the call fails", async () => {
    sendMeAgentTodo.mockResolvedValue({ ok: false, reason: "failed" });
    const res = fakeRes();

    await handleCreateMeAgentTodo(fakeReq(JSON.stringify({ text: "a" })), res);

    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toMatch(/http|stack/i);
  });
});
