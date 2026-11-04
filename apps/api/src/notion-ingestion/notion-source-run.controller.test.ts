import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeRes } from "./test-mocks/fake-http.js";
import { FakeNotionPageGateway } from "./fake-notion-page.gateway.js";

vi.mock("./notion-ingestion-source.repo.js", () => ({ getNotionSourceRow: vi.fn() }));
vi.mock("./run-notion-source.js", () => ({ runNotionSource: vi.fn() }));
vi.mock("./run-due-notion-sources.js", () => ({ runDueNotionSources: vi.fn() }));
vi.mock("./default-notion-gateway.js", () => ({ defaultNotionGateway: vi.fn() }));

const { getNotionSourceRow } = await import("./notion-ingestion-source.repo.js");
const { runNotionSource } = await import("./run-notion-source.js");
const { runDueNotionSources } = await import("./run-due-notion-sources.js");
const { defaultNotionGateway } = await import("./default-notion-gateway.js");
const { handleRunDueNotionSources, handleRunNotionSource } = await import("./notion-source-run.controller.js");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(defaultNotionGateway).mockReturnValue(new FakeNotionPageGateway());
});

describe("handleRunNotionSource", () => {
  it("should answer 404 for an unknown source", async () => {
    vi.mocked(getNotionSourceRow).mockResolvedValue(null);

    const res = fakeRes();

    await handleRunNotionSource(res, "nis_x");

    expect(res.status).toBe(404);
    expect(runNotionSource).not.toHaveBeenCalled();
  });

  it("should answer 409 already_running when a run is in progress", async () => {
    vi.mocked(getNotionSourceRow).mockResolvedValue({ id: "nis_1" } as never);
    vi.mocked(runNotionSource).mockResolvedValue({ kind: "already_running" });

    const res = fakeRes();

    await handleRunNotionSource(res, "nis_1");

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "already_running" });
  });

  it("should return the run result for Ingest Now", async () => {
    const result = { status: "ok", read: 1, imported: 1, skippedExisting: 0, ignored: 0, removed: 0, removeFailed: 0, truncated: false, pendingAfterLimit: 0 } as const;

    vi.mocked(getNotionSourceRow).mockResolvedValue({ id: "nis_1" } as never);
    vi.mocked(runNotionSource).mockResolvedValue({ kind: "finished", result });

    const res = fakeRes();

    await handleRunNotionSource(res, "nis_1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
    expect(vi.mocked(runNotionSource).mock.calls[0]?.[1]).toBe("manual");
  });

  it("should answer 404 when the source disappears during the run", async () => {
    vi.mocked(getNotionSourceRow).mockResolvedValue({ id: "nis_1" } as never);
    vi.mocked(runNotionSource).mockResolvedValue({ kind: "source_missing" });

    const res = fakeRes();

    await handleRunNotionSource(res, "nis_1");

    expect(res.status).toBe(404);
  });
});

describe("handleRunDueNotionSources", () => {
  it("should return the reports of the sources the tick ran", async () => {
    vi.mocked(runDueNotionSources).mockResolvedValue([{ sourceId: "nis_1", status: "failed", result: null }]);

    const res = fakeRes();

    await handleRunDueNotionSources(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ runs: [{ sourceId: "nis_1", status: "failed", result: null }] });
  });
});
