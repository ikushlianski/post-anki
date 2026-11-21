import { z } from "zod";
import { loadEnv } from "../shared/env.js";

export const ME_AGENT_TIMEOUT_MS = 10_000;

export const meAgentTodoInput = z.object({
  text: z.string().trim().min(1).max(2000),
  title: z.string().trim().min(1).max(120).optional(),
});

export type MeAgentTodo = z.infer<typeof meAgentTodoInput>;

export type MeAgentSendResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "failed" };

export async function sendMeAgentTodo(todo: MeAgentTodo): Promise<MeAgentSendResult> {
  const { ME_AGENT_TODO_URL: url, ME_AGENT_TODO_TOKEN: token } = loadEnv();

  if (!url) {
    return { ok: false, reason: "not_configured" };
  }

  const title = todo.title ?? todo.text.slice(0, 80);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ME_AGENT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ title, text: todo.text }),
    });

    return response.status >= 200 && response.status < 300
      ? { ok: true }
      : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  } finally {
    clearTimeout(timer);
  }
}
