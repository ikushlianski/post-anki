import pino from "pino";
import { loadEnv } from "./env.js";
import { serializeError } from "./log-error.js";

export const log = pino({ level: loadEnv().LOG_LEVEL, serializers: { err: serializeError } });
