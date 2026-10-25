import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../shared/log.js", () => ({ log: { info: vi.fn() } }));

import type { AuthEmail } from "./auth-email.js";

const { createMagicLinkSender, UNKNOWN_EMAIL_DELAY_MS } = await import("./send-magic-link.js");

function setup(known: boolean) {
  const sendEmail = vi.fn(async (_email: AuthEmail) => undefined);
  const wait = vi.fn(async () => undefined);
  const send = createMagicLinkSender({ userExists: async () => known, sendEmail, wait });

  return { send, sendEmail, wait };
}

describe("magic link sender", () => {
  it("should email a known owner exactly one link", async () => {
    const { send, sendEmail, wait } = setup(true);

    await send({ email: "Owner@Example.com", url: "https://app.example.com/verify?token=abc" });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]?.[0]).toMatchObject({ to: "owner@example.com" });
    expect(wait).not.toHaveBeenCalled();
  });

  it("should send nothing for an unknown email yet resolve after a delay so the response looks the same", async () => {
    const { send, sendEmail, wait } = setup(false);

    await expect(send({ email: "stranger@example.com", url: "https://app.example.com/verify?token=abc" })).resolves.toBeUndefined();

    expect(sendEmail).not.toHaveBeenCalled();
    expect(wait).toHaveBeenCalledWith(UNKNOWN_EMAIL_DELAY_MS);
  });
});
