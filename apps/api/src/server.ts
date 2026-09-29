import { createApiServer } from "./api-server.js";
import { loadEnv } from "./shared/env.js";
import { log } from "./shared/log.js";
import { flushTracing } from "./mastra/mastra.js";
import { closeDb } from "./db/client.js";

const env = loadEnv();
const server = createApiServer();

server.listen(env.PORT, () => {
  log.info({ port: env.PORT }, "api_listening");
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  log.info({ signal }, "api_shutting_down");
  server.close();
  await flushTracing();
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
