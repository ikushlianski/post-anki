import type http from "node:http";
import { sendJson } from "../shared/http.js";
import { getDomainMapForSubject } from "./domain-map.repo.js";

export async function handleGetDomainMap(
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  const tree = await getDomainMapForSubject(subjectId);

  sendJson(res, 200, tree);
}
