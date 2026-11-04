import type http from "node:http";

type ShutdownServer = Pick<http.Server, "close" | "closeIdleConnections" | "closeAllConnections">;

export interface InflightTracker {
  track: <T>(work: Promise<T>) => Promise<T>;
  idle: () => Promise<void>;
}

export function createInflightTracker(): InflightTracker {
  const pending = new Set<Promise<unknown>>();

  return {
    track<T>(work: Promise<T>): Promise<T> {
      pending.add(work);

      const forget = () => void pending.delete(work);

      work.then(forget, forget);

      return work;
    },
    async idle(): Promise<void> {
      while (pending.size > 0) {
        await Promise.allSettled([...pending]);
      }
    },
  };
}

export interface BotShutdownDeps {
  server: ShutdownServer;
  inflight: InflightTracker;
  closeDb: () => Promise<void>;
  exit: (code: number) => void;
  drainMs?: number;
  closeDbMs?: number;
  onSignal?: (signal: string) => void;
  onCloseError?: (error: unknown) => void;
}

export function createBotShutdown(deps: BotShutdownDeps): (signal: string) => Promise<void> {
  const { server, inflight, closeDb, exit, drainMs = 10_000, closeDbMs = 5_000 } = deps;
  let started = false;

  return async function shutdown(signal: string): Promise<void> {
    if (started) {
      return;
    }

    started = true;
    deps.onSignal?.(signal);

    server.close();
    server.closeIdleConnections();

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, drainMs);

      void inflight.idle().then(() => {
        clearTimeout(timer);
        resolve();
      });
    });

    server.closeAllConnections();

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        deps.onCloseError?.(new Error("database close timed out"));
        resolve();
      }, closeDbMs);

      closeDb()
        .catch((error: unknown) => deps.onCloseError?.(error))
        .finally(() => {
          clearTimeout(timer);
          resolve();
        });
    });

    exit(0);
  };
}
