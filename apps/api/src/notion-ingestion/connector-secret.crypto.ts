import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyBytes(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");

  if (key.length !== 32) {
    throw new Error("connector secret key must be 32 bytes");
  }

  return key;
}

export function encryptSecret(plain: string, keyBase64: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(keyBase64), iv, { authTagLength: TAG_BYTES });
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);

  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(":");
}

export function decryptSecret(ciphertext: string, keyBase64: string): string {
  const [version, iv, tag, body] = ciphertext.split(":");

  if (version !== VERSION || !iv || !tag || !body) {
    throw new Error("unsupported secret format");
  }

  const tagBytes = Buffer.from(tag, "base64");

  if (tagBytes.length !== TAG_BYTES) {
    throw new Error("unsupported secret format");
  }

  const decipher = createDecipheriv("aes-256-gcm", keyBytes(keyBase64), Buffer.from(iv, "base64"), {
    authTagLength: TAG_BYTES,
  });

  decipher.setAuthTag(tagBytes);

  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}
