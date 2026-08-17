import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchElectricShape } from "./electric-proxy.service.js";

vi.mock("../shared/env.js", () => ({
  loadEnv: () => ({
    ELECTRIC_SERVICE_URL: "http://electric.test",
    ELECTRIC_AUTH_MODE: "none",
  }),
}));

function mockFetch() {
  const spy = vi.fn(
    async (_input: string | URL) =>
      new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
  );

  vi.stubGlobal("fetch", spy);

  return spy;
}

function requestedUrl(spy: ReturnType<typeof mockFetch>): URL {
  const call = spy.mock.calls[0];

  if (!call) {
    throw new Error("electric was never called");
  }

  return new URL(String(call[0]));
}

describe("fetchElectricShape", () => {
  let fetchSpy: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchSpy = mockFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("allowed tables", () => {
    it("builds the upstream url from the registry definition", async () => {
      await fetchElectricShape("?table=subjects");

      const url = requestedUrl(fetchSpy);

      expect(`${url.origin}${url.pathname}`).toBe("http://electric.test/v1/shape");
      expect(url.searchParams.get("table")).toBe("subjects");
      expect(url.searchParams.has("columns")).toBe(false);
    });

    it("pins the server-side column list for sources", async () => {
      await fetchElectricShape("?table=sources");

      expect(requestedUrl(fetchSpy).searchParams.get("columns")).toBe(
        "id,curriculum_id,kind",
      );
    });

    it("ignores a client-supplied columns list and substitutes its own", async () => {
      await fetchElectricShape("?table=sources&columns=id,secret_token,raw_text");

      expect(requestedUrl(fetchSpy).searchParams.get("columns")).toBe(
        "id,curriculum_id,kind",
      );
    });

    it("drops a client-supplied columns list on a table with no pinned columns", async () => {
      await fetchElectricShape("?table=subjects&columns=id,name");

      expect(requestedUrl(fetchSpy).searchParams.has("columns")).toBe(false);
    });

    it("drops a client-supplied where clause", async () => {
      await fetchElectricShape("?table=subjects&where=1%3D1");

      expect(requestedUrl(fetchSpy).searchParams.has("where")).toBe(false);
    });

    it("drops client-supplied subset and where-binding params", async () => {
      await fetchElectricShape(
        "?table=subjects&params=%7B%7D&subset__where=true&subset__limit=1&subset__order_by=id",
      );

      const url = requestedUrl(fetchSpy);

      expect(url.searchParams.has("params")).toBe(false);
      expect(url.searchParams.has("subset__where")).toBe(false);
      expect(url.searchParams.has("subset__limit")).toBe(false);
      expect(url.searchParams.has("subset__order_by")).toBe(false);
    });

    it("returns the upstream status and electric headers", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response("[]", {
            status: 200,
            headers: {
              "content-type": "application/json",
              "electric-handle": "h1",
              "electric-offset": "0_0",
              "x-internal": "hidden",
            },
          }),
        ),
      );

      const result = await fetchElectricShape("?table=subjects");

      expect(result.status).toBe(200);
      expect(result.headers["electric-handle"]).toBe("h1");
      expect(result.headers["electric-offset"]).toBe("0_0");
      expect(result.headers["x-internal"]).toBeUndefined();
    });
  });

  describe("sync protocol params", () => {
    it("passes through cursor and pagination state unchanged", async () => {
      await fetchElectricShape(
        "?table=phrases&offset=42_7&handle=abc-1&live=true&cursor=99&replica=full&log=changes_only&cache-buster=7&expired_handle=old-1&live_sse=true&experimental_live_sse=true",
      );

      const params = requestedUrl(fetchSpy).searchParams;

      expect(params.get("offset")).toBe("42_7");
      expect(params.get("handle")).toBe("abc-1");
      expect(params.get("live")).toBe("true");
      expect(params.get("cursor")).toBe("99");
      expect(params.get("replica")).toBe("full");
      expect(params.get("log")).toBe("changes_only");
      expect(params.get("cache-buster")).toBe("7");
      expect(params.get("expired_handle")).toBe("old-1");
      expect(params.get("live_sse")).toBe("true");
      expect(params.get("experimental_live_sse")).toBe("true");
    });

    it("omits sync params the client did not send", async () => {
      await fetchElectricShape("?table=subjects");

      const params = requestedUrl(fetchSpy).searchParams;

      expect(params.has("offset")).toBe(false);
      expect(params.has("handle")).toBe(false);
      expect(params.has("live")).toBe(false);
    });
  });

  describe("rejected requests", () => {
    it("rejects an unknown table with 400 and never calls electric", async () => {
      const result = await fetchElectricShape("?table=api_tokens");

      expect(result.status).toBe(400);
      expect(result.headers["content-type"]).toBe("application/json");
      expect(JSON.parse(result.body).error).toBe("table_not_allowed");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects a missing table with 400", async () => {
      const result = await fetchElectricShape("?offset=-1");

      expect(result.status).toBe(400);
      expect(JSON.parse(result.body).error).toBe("table_required");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects a smuggled second table rather than picking one", async () => {
      const result = await fetchElectricShape("?table=subjects&table=api_tokens");

      expect(result.status).toBe(400);
      expect(JSON.parse(result.body).error).toBe("table_invalid");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
