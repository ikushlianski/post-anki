import http from "node:http";
import type { AddressInfo } from "node:net";

export interface FunctionUrlEvent {
  rawPath: string;
  rawQueryString?: string;
  headers?: Record<string, string>;
  cookies?: string[];
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string } };
}

export interface FunctionUrlResult {
  statusCode: number;
  headers: Record<string, string>;
  cookies?: string[];
  body: string;
  isBase64Encoded: boolean;
}

type SsmClient = { send(command: unknown): Promise<{ Parameter?: { Value?: string } }> };
type SsmModule = {
  SSMClient: new () => SsmClient;
  GetParameterCommand: new (input: { Name: string; WithDecryption: boolean }) => unknown;
};

const TEXTUAL = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded))|\+json|\+xml/i;

export async function loadSecretsFromSsm(
  mapping: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const entries = Object.entries(mapping).filter(([key]) => !env[key]);

  if (entries.length === 0) {
    return;
  }

  const moduleName = "@aws-sdk/client-ssm";
  const { SSMClient, GetParameterCommand } = (await import(moduleName)) as SsmModule;
  const client = new SSMClient();

  await Promise.all(
    entries.map(async ([key, name]) => {
      const out = await client.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
      const value = out.Parameter?.Value;

      if (!value) {
        throw new Error(`ssm_parameter_empty:${name}`);
      }

      env[key] = value;
    }),
  );
}

function parseSsmMapping(raw: string | undefined): Record<string, string> {
  if (!raw) {
    return {};
  }

  return JSON.parse(raw) as Record<string, string>;
}

function buildHeaders(event: FunctionUrlEvent): Record<string, string> {
  const headers: Record<string, string> = { ...(event.headers ?? {}) };

  if (event.cookies?.length) {
    headers.cookie = event.cookies.join("; ");
  }

  return headers;
}

function forward(server: http.Server, event: FunctionUrlEvent): Promise<FunctionUrlResult> {
  const { port } = server.address() as AddressInfo;
  const body = event.body
    ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8")
    : undefined;
  const headers = buildHeaders(event);

  delete headers["content-length"];
  delete headers.host;

  if (body) {
    headers["content-length"] = String(body.length);
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method: event.requestContext.http.method,
        path: `${event.rawPath}${event.rawQueryString ? `?${event.rawQueryString}` : ""}`,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];

        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () => {
          const out: Record<string, string> = {};
          let cookies: string[] | undefined;

          for (const [name, value] of Object.entries(res.headers)) {
            if (name === "set-cookie") {
              cookies = Array.isArray(value) ? value : value ? [value] : undefined;
            } else if (value !== undefined) {
              out[name] = Array.isArray(value) ? value.join(", ") : value;
            }
          }

          const raw = Buffer.concat(chunks);
          const textual = TEXTUAL.test(out["content-type"] ?? "") && !out["content-encoding"];

          resolve({
            statusCode: res.statusCode ?? 500,
            headers: out,
            ...(cookies ? { cookies } : {}),
            body: raw.toString(textual ? "utf8" : "base64"),
            isBase64Encoded: !textual && raw.length > 0,
          });
        });
      },
    );

    req.on("error", reject);
    req.end(body);
  });
}

export function createLambdaHandler(deps: {
  getListener: () => Promise<http.RequestListener>;
  prepare?: () => Promise<void>;
}): (event: FunctionUrlEvent) => Promise<FunctionUrlResult> {
  let ready: Promise<http.Server> | undefined;

  const start = async (): Promise<http.Server> => {
    await deps.prepare?.();

    const server = http.createServer(await deps.getListener());

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    server.unref();

    return server;
  };

  return async (event) => {
    ready ??= start().catch((err: unknown) => {
      ready = undefined;
      throw err;
    });

    return forward(await ready, event);
  };
}

export const handler = createLambdaHandler({
  prepare: () => loadSecretsFromSsm(parseSsmMapping(process.env.SSM_SECRET_PARAMS)),
  getListener: async () => (await import("./api-server.js")).createApiRequestListener(),
});
