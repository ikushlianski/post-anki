import http from "node:http";
import { serve } from "inngest/node";
import { InngestFunction } from "inngest";
import { createInngestClient } from "./inngest-client.js";

export function createInngestServeHandler(
  functions: InngestFunction.Like[],
): http.RequestListener {
  const client = createInngestClient();

  return serve({ client, functions });
}
