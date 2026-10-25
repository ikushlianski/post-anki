import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { users } from "../db/schema.js";
import { log } from "../shared/log.js";
import { sendAuthEmail, type AuthEmail } from "./auth-email.js";
import { purgeExpiredAuthRowsHourly } from "./purge-expired-auth-rows.js";

export const UNKNOWN_EMAIL_DELAY_MS = 700;

export interface MagicLinkPayload {
  email: string;
  url: string;
}

export interface MagicLinkDeps {
  userExists: (email: string) => Promise<boolean>;
  sendEmail: (email: AuthEmail) => Promise<void>;
  wait: (ms: number) => Promise<void>;
  purgeExpired?: () => void;
}

function redactEmail(email: string): string {
  return createHash("sha256").update(email).digest("hex").slice(0, 8);
}

function buildEmail({ email, url }: MagicLinkPayload): AuthEmail {
  return {
    to: email,
    subject: "Your Post Anki sign-in link",
    text: `Sign in to Post Anki:\n\n${url}\n\nThe link works once and expires in 10 minutes. If you did not ask for it, ignore this email.`,
    html: `<p>Sign in to Post Anki:</p><p><a href="${url}">Sign in</a></p><p>The link works once and expires in 10 minutes. If you did not ask for it, ignore this email.</p>`,
  };
}

export function createMagicLinkSender(deps: MagicLinkDeps) {
  return async (payload: MagicLinkPayload): Promise<void> => {
    const email = payload.email.trim().toLowerCase();

    deps.purgeExpired?.();

    if (!(await deps.userExists(email))) {
      log.info({ emailHash: redactEmail(email) }, "magic_link_unknown_email");
      await deps.wait(UNKNOWN_EMAIL_DELAY_MS);

      return;
    }

    try {
      await deps.sendEmail(buildEmail({ ...payload, email }));
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown";

      log.error({ emailHash: redactEmail(email), reason }, "magic_link_send_failed");
    }
  };
}

export const sendMagicLink = createMagicLinkSender({
  userExists: async (email) => {
    const rows = await getDb().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

    return rows.length > 0;
  },
  sendEmail: (email) => sendAuthEmail(email),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  purgeExpired: purgeExpiredAuthRowsHourly,
});
