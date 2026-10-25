import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/env.js", () => ({
  loadEnv: vi.fn(),
}));

const { loadEnv } = await import("../shared/env.js");
const { sendAuthEmail } = await import("./auth-email.js");

const email = { to: "owner@example.com", subject: "Sign in", text: "t", html: "<p>t</p>" };

function configure(values: { RESEND_API_KEY?: string; AUTH_EMAIL_FROM?: string }) {
  vi.mocked(loadEnv).mockReturnValue(values as ReturnType<typeof loadEnv>);
}

describe("sendAuthEmail", () => {
  beforeEach(() => {
    configure({ RESEND_API_KEY: "re_key", AUTH_EMAIL_FROM: "Post Anki <login@example.com>" });
  });

  it("should send the sign-in email through Resend with the key, sender, recipient and a user agent", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    await sendAuthEmail(email, fetchMock as unknown as typeof fetch);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;

    expect(url).toBe("https://api.resend.com/emails");
    expect(headers.authorization).toBe("Bearer re_key");
    expect(headers["user-agent"]).toBeTruthy();
    expect(body).toMatchObject({ from: "Post Anki <login@example.com>", to: ["owner@example.com"], subject: "Sign in" });
  });

  it("should fail loudly when Resend rejects the email so the owner is not told a link was sent", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 403 }));

    await expect(sendAuthEmail(email, fetchMock as unknown as typeof fetch)).rejects.toThrow("auth_email_failed_403");
  });

  it("should refuse to send when email delivery is not configured", async () => {
    configure({});

    await expect(sendAuthEmail(email, vi.fn() as unknown as typeof fetch)).rejects.toThrow("auth_email_not_configured");
  });
});
