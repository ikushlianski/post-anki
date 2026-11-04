import crypto from "node:crypto";

export function secretsEqual(actual: string | string[] | undefined, expected: string): boolean {
  if (typeof actual !== "string") {
    return false;
  }

  const digestA = crypto.createHash("sha256").update(actual).digest();
  const digestB = crypto.createHash("sha256").update(expected).digest();

  return crypto.timingSafeEqual(digestA, digestB);
}
