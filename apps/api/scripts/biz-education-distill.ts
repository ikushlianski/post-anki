import process from "node:process";
import { closeDb } from "../src/db/client.js";
import { distillBizEducation } from "../src/biz-education-distiller/distiller.orchestrator.js";

const result = await distillBizEducation();

await closeDb();

console.log(JSON.stringify(result));

process.exit(result.failed.length > 0 || result.markSyncedFailed.length > 0 ? 1 : 0);
