import pg from "pg";

const RETRYABLE_PG_CODES = new Set(["57P01", "57P02", "57P03"]);
const RETRYABLE_NET_CODES = new Set(["ECONNRESET", "EPIPE"]);

export function isConnectionLevelError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) {
    return false;
  }

  const { code, message } = err as { code?: unknown; message?: unknown };

  if (typeof code === "string" && (RETRYABLE_PG_CODES.has(code) || RETRYABLE_NET_CODES.has(code))) {
    return true;
  }

  return typeof message === "string" && message.includes("Connection terminated unexpectedly");
}

export async function retryOnceOnConnectionError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isConnectionLevelError(err)) {
      throw err;
    }

    return fn();
  }
}

type LooseQuery = (...args: unknown[]) => unknown;

function isThenable(value: unknown): value is Promise<unknown> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}

export class RetryingPool extends pg.Pool {
  constructor(config?: pg.PoolConfig) {
    super(config);

    const original = this.query.bind(this) as unknown as LooseQuery;
    const retrying: LooseQuery = (...args) => {
      const first = original(...args);

      if (!isThenable(first)) {
        return first;
      }

      return first.catch((err: unknown) => {
        if (!isConnectionLevelError(err)) {
          throw err;
        }

        console.warn("db_query_retried_after_connection_error");

        return original(...args);
      });
    };

    this.query = retrying as unknown as pg.Pool["query"];
  }
}
