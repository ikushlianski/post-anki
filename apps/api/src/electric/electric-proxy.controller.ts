import type http from "node:http";
import { fetchElectricShape } from "./electric-proxy.service.js";

export async function handleGetElectricShape(
  res: http.ServerResponse,
  search: string,
): Promise<void> {
  const shape = await fetchElectricShape(search);

  res.writeHead(shape.status, shape.headers);
  res.end(shape.body);
}
