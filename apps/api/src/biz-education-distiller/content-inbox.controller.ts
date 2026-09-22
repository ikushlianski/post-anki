import type http from "node:http";
import { sendJson } from "../shared/http.js";
import { listContentInbox } from "./distiller.repo.js";

export async function handleListContentInbox(res: http.ServerResponse): Promise<void> {
  const rows = await listContentInbox();

  sendJson(res, 200, rows);
}
