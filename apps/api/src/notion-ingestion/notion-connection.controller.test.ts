import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReq, fakeRes } from "./test-mocks/fake-http.js";
import { FakeNotionPageGateway } from "./fake-notion-page.gateway.js";
import { decryptSecret } from "./connector-secret.crypto.js";

const KEY = Buffer.alloc(32, 9).toString("base64");
const TOKEN = "secret_SUPERSECRET_TOKEN_123";

vi.mock("../shared/env.js", () => ({ loadEnv: vi.fn() }));
vi.mock("./connector-secret.repo.js", () => ({
  getConnectorSecret: vi.fn(),
  saveConnectorSecret: vi.fn(),
  deleteConnectorSecret: vi.fn(),
}));
vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("./default-notion-gateway.js", () => ({ defaultNotionGateway: vi.fn() }));

const { loadEnv } = await import("../shared/env.js");
const secrets = await import("./connector-secret.repo.js");
const { log } = await import("../shared/log.js");
const { defaultNotionGateway } = await import("./default-notion-gateway.js");
const controller = await import("./notion-connection.controller.js");

type Env = ReturnType<typeof loadEnv>;

function setEnv(env: Partial<Env>): void {
  vi.mocked(loadEnv).mockReturnValue(env as Env);
}

let stored: string | null;

beforeEach(() => {
  vi.clearAllMocks();
  stored = null;
  vi.mocked(secrets.getConnectorSecret).mockImplementation(async () => stored);
  vi.mocked(secrets.saveConnectorSecret).mockImplementation(async (_name, ciphertext) => {
    stored = ciphertext;
  });
  vi.mocked(secrets.deleteConnectorSecret).mockImplementation(async () => {
    stored = null;
  });
});

describe("notion connection endpoints", () => {
  it("should save the token encrypted and never return it", async () => {
    setEnv({ CONNECTOR_SECRET_KEY: KEY });

    const res = fakeRes();

    await controller.handleSaveNotionConnection(fakeReq({ token: TOKEN }), res);

    expect(res.body).toEqual({ configured: true, origin: "settings", canStoreToken: true });
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
    expect(stored).not.toContain(TOKEN);
    expect(decryptSecret(stored ?? "", KEY)).toBe(TOKEN);
    expect(JSON.stringify(vi.mocked(log.info).mock.calls)).not.toContain(TOKEN);
  });

  it("should answer 409 secret_key_missing when the server has no encryption key", async () => {
    setEnv({});

    const res = fakeRes();

    await controller.handleSaveNotionConnection(fakeReq({ token: TOKEN }), res);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "secret_key_missing" });
    expect(secrets.saveConnectorSecret).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
  });

  it("should refuse an empty token without echoing the body", async () => {
    setEnv({ CONNECTOR_SECRET_KEY: KEY });

    const res = fakeRes();

    await controller.handleSaveNotionConnection(fakeReq({ token: "" }), res);

    expect(res.status).toBe(400);
  });

  it("should report the server environment as origin when only NOTION_TOKEN is set", async () => {
    setEnv({ NOTION_TOKEN: TOKEN });

    const res = fakeRes();

    await controller.handleGetNotionConnection(res);

    expect(res.body).toEqual({ configured: true, origin: "env", canStoreToken: false });
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
  });

  it("should prefer the saved token over the environment one", async () => {
    setEnv({ CONNECTOR_SECRET_KEY: KEY, NOTION_TOKEN: "env_token" });
    await controller.handleSaveNotionConnection(fakeReq({ token: TOKEN }), fakeRes());

    const res = fakeRes();

    await controller.handleGetNotionConnection(res);

    expect(res.body).toMatchObject({ origin: "settings" });
  });

  it("should report not configured after the token is removed", async () => {
    setEnv({ CONNECTOR_SECRET_KEY: KEY });
    await controller.handleSaveNotionConnection(fakeReq({ token: TOKEN }), fakeRes());

    const res = fakeRes();

    await controller.handleDeleteNotionConnection(res);

    expect(res.body).toEqual({ configured: false, origin: "none", canStoreToken: true });
  });

  it("should fall back to the environment token when the saved one cannot be decrypted", async () => {
    setEnv({ CONNECTOR_SECRET_KEY: KEY, NOTION_TOKEN: "env_token" });
    stored = "v1:bad:bad:bad";

    const res = fakeRes();

    await controller.handleGetNotionConnection(res);

    expect(res.body).toMatchObject({ configured: true, origin: "env" });
  });

  it("should return only ok and workspace name from a connection check", async () => {
    const gateway = new FakeNotionPageGateway();

    vi.mocked(defaultNotionGateway).mockReturnValue(gateway);

    const res = fakeRes();

    await controller.handleCheckNotionConnection(res);

    expect(res.body).toEqual({ ok: true, workspaceName: "Fake workspace", reason: null });
  });
});
