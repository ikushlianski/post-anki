import type http from "node:http";

type ShutdownServer = Pick<http.Server, "close" | "closeIdleConnections" | "closeAllConnections">;

export interface GracefulShutdownDeps {
  server: ShutdownServer;
  flush: () => Promise<void>;
  closeDb: () => Promise<void>;
  drainMs?: number;
  cleanupMs?: number;
  exit: (code: number) => void;
  onSignal?: (signal: string) => void;
  onCleanupError?: (step: "flush" | "closeDb", error: unknown) => void;
}

function withCap(task: () => Promise<void>, capMs: number, onError: (error: unknown) => void): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, capMs);

    task()
      .catch(onError)
      .finally(() => {
        clearTimeout(timer);
        resolve();
      });
  });
}

export function createGracefulShutdown(deps: GracefulShutdownDeps): (signal: string) => Promise<void> {
  const { server, flush, closeDb, exit, drainMs = 8000, cleanupMs = 1500 } = deps;
  const reportError = deps.onCleanupError ?? (() => undefined);
  let started = false;

  return async function shutdown(signal: string): Promise<void> {
    if (started) {
      return;
    }

    started = true;
    deps.onSignal?.(signal);

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, drainMs);

      server.close(() => {
        clearTimeout(timer);
        resolve();
      });
      server.closeIdleConnections();
    });

    server.closeAllConnections();

    await withCap(flush, cleanupMs, (error) => reportError("flush", error));
    await withCap(closeDb, cleanupMs, (error) => reportError("closeDb", error));

    exit(0);
  };
}
