import { Readable } from "node:stream";
import type http from "node:http";

export type FakeRes = http.ServerResponse & { status: number | null; body: unknown };

export function fakeReq(body?: unknown): http.IncomingMessage {
  const readable = new Readable({
    read() {
      if (body !== undefined) {
        this.push(JSON.stringify(body));
      }

      this.push(null);
    },
  });

  return readable as unknown as http.IncomingMessage;
}

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
