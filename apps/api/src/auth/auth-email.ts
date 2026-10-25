import { loadEnv } from "../shared/env.js";

const RESEND_URL = "https://api.resend.com/emails";

export interface AuthEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendAuthEmail(email: AuthEmail, fetchImpl: typeof fetch = fetch): Promise<void> {
  const env = loadEnv();

  if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) {
    throw new Error("auth_email_not_configured");
  }

  const response = await fetchImpl(RESEND_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "user-agent": "post-anki-api/1.0",
    },
    body: JSON.stringify({
      from: env.AUTH_EMAIL_FROM,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });

  if (!response.ok) {
    throw new Error(`auth_email_failed_${response.status}`);
  }
}
