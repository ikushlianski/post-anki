export interface RevocableToken {
  id: string;
  label: string;
  revokedAt: Date | null;
}

export type TokenSelection =
  | { ok: true; token: RevocableToken }
  | { ok: false; reason: "not_found" | "ambiguous" | "already_revoked" };

export function selectTokenToRevoke(tokens: RevocableToken[], selector: string): TokenSelection {
  const byId = tokens.find((token) => token.id === selector);
  const matches = byId ? [byId] : tokens.filter((token) => token.label === selector);
  const active = matches.filter((token) => token.revokedAt === null);

  if (matches.length === 0) {
    return { ok: false, reason: "not_found" };
  }

  if (active.length === 0) {
    return { ok: false, reason: "already_revoked" };
  }

  if (active.length > 1) {
    return { ok: false, reason: "ambiguous" };
  }

  return { ok: true, token: active[0]! };
}
