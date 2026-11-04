import type { IncomingMessage } from "node:http";

export function readLimitedBody(
  req: IncomingMessage,
  maxBytes: number,
  onTooLarge: () => void,
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;

    const settle = (value: Buffer | null) => {
      if (settled) return;

      settled = true;
      resolve(value);
    };

    req.on("data", (chunk: Buffer | string) => {
      if (settled) return;

      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      received += buf.length;

      if (received > maxBytes) {
        chunks.length = 0;
        onTooLarge();
        settle(null);
        return;
      }

      chunks.push(buf);
    });

    req.on("end", () => settle(Buffer.concat(chunks)));
    req.on("error", () => settle(null));
  });
}
