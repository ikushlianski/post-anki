import { Inngest } from "inngest";

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.trim() !== "" ? value : undefined;
}

export function createInngestClient(): Inngest {
  return new Inngest({
    id: "post-anki-api",
    signingKey: nonEmpty(process.env.INNGEST_SIGNING_KEY),
    signingKeyFallback: nonEmpty(process.env.INNGEST_SIGNING_KEY_FALLBACK),
  });
}
