const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

// Same hand-rolled parser as apps/mobile/src/api/client.ts's assertSecureUrl
// — kept in sync manually rather than shared cross-package, since it's a
// small, self-contained, already-tested guard with no other cross-cutting
// dependency between these two apps.
function extractProtocolAndHost(url: string): { protocol: string; host: string } {
  const match = /^([a-zA-Z][a-zA-Z\d+\-.]*):\/\/(\[[^\]]+\]|[^/?#]+)/.exec(url);

  if (!match) {
    throw new Error(`Cannot parse API base URL: ${url}`);
  }

  const authority = match[2] ?? "";

  if (authority.includes("@")) {
    throw new Error(`Refusing to parse a URL with embedded userinfo: ${url}`);
  }

  const isBracketed = authority.startsWith("[");
  const host = (isBracketed ? authority.replace(/^\[|\]$/g, "") : authority.split(":")[0]) ?? "";

  return { protocol: `${(match[1] ?? "").toLowerCase()}:`, host: host.toLowerCase() };
}

export function assertSecureUrl(url: string): void {
  const { protocol, host } = extractProtocolAndHost(url);

  if (protocol === "https:") {
    return;
  }

  if (protocol === "http:" && LOOPBACK_HOSTS.has(host)) {
    return;
  }

  if (protocol === "http:") {
    throw new Error(`Refusing to send requests over plaintext HTTP to a non-local host: ${host}`);
  }

  throw new Error(`Refusing to send requests over a non-HTTPS scheme (${protocol}): ${url}`);
}
