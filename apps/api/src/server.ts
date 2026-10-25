import { createApiServer } from "./api-server.js";
import { assertDevDbIsLocal } from "./db/assert-dev-db-is-local.js";
import { loadEnv } from "./shared/env.js";
import { log } from "./shared/log.js";
import { flushTracing } from "./mastra/mastra.js";
import { closeDb } from "./db/client.js";
import { createGracefulShutdown } from "./shared/graceful-shutdown.js";
import { listDisabledDurableFlags } from "./shared/durable-flags.js";

assertDevDbIsLocal(process.env);

const env = loadEnv();
const server = createApiServer();
const disabledDurableFlags = listDisabledDurableFlags();

if (process.env.NODE_ENV === "production" && disabledDurableFlags.length > 0) {
  log.warn({ flags: disabledDurableFlags }, "durable_jobs_disabled_in_production");
}

server.listen(env.PORT, () => {
  log.info({ port: env.PORT }, "api_listening");

  if (env.INNGEST_DEV === "1") {
    log.info("Inngest dev UI: http://localhost:8288 (run `npm run inngest:dev`)");
  }
});

const shutdown = createGracefulShutdown({
  server,
  flush: flushTracing,
  closeDb,
  exit: (code) => process.exit(code),
  onSignal: (signal) => log.info({ signal }, "api_shutting_down"),
  onCleanupError: (step, error) => log.warn({ step, error }, "api_shutdown_cleanup_failed"),
});

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
