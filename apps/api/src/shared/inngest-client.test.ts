import { afterEach, describe, expect, it } from "vitest";
import { createInngestClient } from "./inngest-client.js";

const SAVED = { ...process.env };

afterEach(() => {
  process.env = { ...SAVED };
});

function withEnv(values: Record<string, string | undefined>): void {
  process.env = { ...SAVED, INNGEST_SIGNING_KEY: undefined, INNGEST_SIGNING_KEY_FALLBACK: undefined, ...values };
}

describe("createInngestClient", () => {
  it("should pass the configured signing key and fallback to the client for signed requests", async () => {
    withEnv({ INNGEST_SIGNING_KEY: "signkey-test-aaaa", INNGEST_SIGNING_KEY_FALLBACK: "signkey-test-bbbb" });
    const client = createInngestClient();

    expect(await client["signingKey"]).toBe("signkey-test-aaaa");
    expect(await client["signingKeyFallback"]).toBe("signkey-test-bbbb");
  });

  it("should leave both keys unset in local dev so the client boots as before", async () => {
    withEnv({ INNGEST_DEV: "1" });
    const client = createInngestClient();

    expect(await client["signingKey"]).toBeFalsy();
    expect(await client["signingKeyFallback"]).toBeFalsy();
  });
});
