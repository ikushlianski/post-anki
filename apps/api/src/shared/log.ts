import pino from "pino";
import { loadEnv } from "./env.js";
import { serializeError } from "./log-error.js";

export const LOG_REDACT_PATHS = ["token", "*.token", "req.headers.authorization"];

export const log = pino({
  level: loadEnv().LOG_LEVEL,
  serializers: { err: serializeError },
  redact: LOG_REDACT_PATHS,
});
