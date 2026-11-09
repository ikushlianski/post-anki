import pg from "pg";

const ADMIN_SHUTDOWN = "57P01";
const seen = new WeakSet<object>();

function rethrowUnlessAdminShutdown(err: unknown): void {
  if ((err as { code?: string } | null)?.code !== ADMIN_SHUTDOWN) {
    throw err;
  }
}

function listenOnce(emitter: { on(event: "error", listener: (err: unknown) => void): unknown }): void {
  if (seen.has(emitter)) {
    return;
  }

  seen.add(emitter);
  emitter.on("error", rethrowUnlessAdminShutdown);
}

const clientConnect = pg.Client.prototype.connect as (this: pg.Client, ...args: unknown[]) => unknown;
const poolConnect = pg.Pool.prototype.connect as (this: pg.Pool, ...args: unknown[]) => unknown;

pg.Client.prototype.connect = function patchedConnect(this: pg.Client, ...args: unknown[]) {
  listenOnce(this);

  return clientConnect.apply(this, args);
} as typeof pg.Client.prototype.connect;

pg.Pool.prototype.connect = function patchedConnect(this: pg.Pool, ...args: unknown[]) {
  listenOnce(this);

  return poolConnect.apply(this, args);
} as typeof pg.Pool.prototype.connect;
