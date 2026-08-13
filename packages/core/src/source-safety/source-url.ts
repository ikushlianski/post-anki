export type SourceUrlRejectionReason =
  | "malformed_url"
  | "unsupported_scheme"
  | "private_address"
  | "blocked_host";

export interface SourceUrlAllowed {
  allowed: true;
  url: string;
}

export interface SourceUrlRejected {
  allowed: false;
  reason: SourceUrlRejectionReason;
  message: string;
}

export type SourceUrlVerdict = SourceUrlAllowed | SourceUrlRejected;

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

const BLOCKED_HOSTS = new Set(["localhost", "metadata", "metadata.google.internal"]);

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

const BLOCKED_IPV4_RANGES: { base: number; prefix: number }[] = [
  { base: toIpv4Number([0, 0, 0, 0]), prefix: 8 },
  { base: toIpv4Number([10, 0, 0, 0]), prefix: 8 },
  { base: toIpv4Number([100, 64, 0, 0]), prefix: 10 },
  { base: toIpv4Number([127, 0, 0, 0]), prefix: 8 },
  { base: toIpv4Number([169, 254, 0, 0]), prefix: 16 },
  { base: toIpv4Number([172, 16, 0, 0]), prefix: 12 },
  { base: toIpv4Number([192, 0, 0, 0]), prefix: 24 },
  { base: toIpv4Number([192, 168, 0, 0]), prefix: 16 },
  { base: toIpv4Number([198, 18, 0, 0]), prefix: 15 },
  { base: toIpv4Number([224, 0, 0, 0]), prefix: 4 },
  { base: toIpv4Number([240, 0, 0, 0]), prefix: 4 },
];

export function isSafeSourceUrl(url: string): SourceUrlVerdict {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return reject("malformed_url", "this does not look like a valid web address");
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return reject(
      "unsupported_scheme",
      `only http and https links can be fetched, not "${parsed.protocol.replace(":", "")}"`,
    );
  }

  const host = parsed.hostname.toLowerCase();

  if (host.length === 0) {
    return reject("malformed_url", "this address has no host");
  }

  if (host.startsWith("[")) {
    return verdictForIpv6(url, host.slice(1, -1));
  }

  const ipv4 = parseIpv4(host);

  if (ipv4 !== null) {
    return isBlockedIpv4(ipv4)
      ? reject("private_address", "this address points at a private or internal network")
      : allow(url);
  }

  if (BLOCKED_HOSTS.has(host) || !host.includes(".")) {
    return reject("blocked_host", "this address points at an internal host");
  }

  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return reject("blocked_host", "this address points at an internal host");
  }

  return allow(url);
}

function verdictForIpv6(url: string, literal: string): SourceUrlVerdict {
  const groups = parseIpv6(literal);

  if (groups === null) {
    return reject("private_address", "this address could not be confirmed as a public one");
  }

  const mapped = mappedIpv4(groups);

  if (mapped !== null) {
    return isBlockedIpv4(mapped)
      ? reject("private_address", "this address points at a private or internal network")
      : allow(url);
  }

  return isBlockedIpv6(groups)
    ? reject("private_address", "this address points at a private or internal network")
    : allow(url);
}

function parseIpv4(host: string): number | null {
  const match = IPV4_PATTERN.exec(host);

  if (!match) {
    return null;
  }

  const octets = match.slice(1).map((part) => Number(part));

  return octets.every((octet) => octet <= 255) ? toIpv4Number(octets) : null;
}

function toIpv4Number(octets: number[]): number {
  return ((octets[0]! << 24) | (octets[1]! << 16) | (octets[2]! << 8) | octets[3]!) >>> 0;
}

function isBlockedIpv4(address: number): boolean {
  return BLOCKED_IPV4_RANGES.some(({ base, prefix }) => {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;

    return (address & mask) >>> 0 === (base & mask) >>> 0;
  });
}

function parseIpv6(literal: string): number[] | null {
  const halves = literal.split("::");

  if (halves.length > 2) {
    return null;
  }

  const head = halves[0] ? halves[0]!.split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1]!.split(":") : [];
  const expandedHead = expandGroups(head);
  const expandedTail = expandGroups(tail);

  if (expandedHead === null || expandedTail === null) {
    return null;
  }

  if (halves.length === 1) {
    return expandedHead.length === 8 ? expandedHead : null;
  }

  const gap = 8 - expandedHead.length - expandedTail.length;

  if (gap < 0) {
    return null;
  }

  return [...expandedHead, ...new Array<number>(gap).fill(0), ...expandedTail];
}

function expandGroups(groups: string[]): number[] | null {
  const expanded: number[] = [];

  for (const group of groups) {
    if (group.includes(".")) {
      const embedded = parseIpv4(group);

      if (embedded === null) {
        return null;
      }

      expanded.push(embedded >>> 16, embedded & 0xffff);
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/.test(group)) {
      return null;
    }

    expanded.push(Number.parseInt(group, 16));
  }

  return expanded;
}

function mappedIpv4(groups: number[]): number | null {
  const isMapped =
    groups.slice(0, 5).every((group) => group === 0) &&
    (groups[5] === 0xffff || (groups[5] === 0 && groups[6] !== 0));

  return isMapped ? ((groups[6]! << 16) | groups[7]!) >>> 0 : null;
}

function isBlockedIpv6(groups: number[]): boolean {
  const isUnspecified = groups.every((group) => group === 0);
  const isLoopback = groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
  const isUniqueLocal = (groups[0]! & 0xfe00) === 0xfc00;
  const isLinkLocal = (groups[0]! & 0xffc0) === 0xfe80;

  return isUnspecified || isLoopback || isUniqueLocal || isLinkLocal;
}

function allow(url: string): SourceUrlAllowed {
  return { allowed: true, url };
}

function reject(reason: SourceUrlRejectionReason, message: string): SourceUrlRejected {
  return { allowed: false, reason, message };
}
