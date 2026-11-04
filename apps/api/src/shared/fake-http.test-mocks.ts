import { Readable } from "node:stream";
import type http from "node:http";

export function fakeReq(body: string): http.IncomingMessage {
  return Readable.from([Buffer.from(body)]) as unknown as http.IncomingMessage;
}

export type FakeRes = http.ServerResponse & { status: number | null; body: unknown };

export function fakeRes(): FakeRes {
  const res = {
    status: null as number | null,
    body: undefined as unknown,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end(payload?: string) {
      res.body = payload ? JSON.parse(payload) : undefined;
    },
  };

  return res as unknown as FakeRes;
}

