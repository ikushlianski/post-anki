import { ALLOWED_HOSTS, FORBIDDEN_TARGETS } from './forbidden-targets'

export interface AssertTargetAllowedResult {
  allowed: boolean
  host?: string
  refusalMessage?: string
}

export function assertTargetAllowed(
  connectionString: string | undefined,
): AssertTargetAllowedResult {
  if (connectionString === undefined || connectionString.trim() === '') {
    return {
      allowed: false,
      refusalMessage:
        'E2E_DATABASE_URL is required and must point at the local Postgres — no implicit default exists for a mutating test target',
    }
  }

  for (const fragment of FORBIDDEN_TARGETS) {
    if (connectionString.includes(fragment)) {
      return {
        allowed: false,
        refusalMessage: `refusing to connect: target contains forbidden host fragment "${fragment}" — e2e mutates a local DB only, never a cloud/shared database`,
      }
    }
  }

  let host: string

  try {
    host = new URL(connectionString).hostname
  } catch {
    return {
      allowed: false,
      refusalMessage: `E2E_DATABASE_URL is not a valid connection URL`,
    }
  }

  if (!ALLOWED_HOSTS.has(host)) {
    return {
      allowed: false,
      host,
      refusalMessage: `refusing to connect: host "${host}" is not in the local allowlist (${[...ALLOWED_HOSTS].join(', ')}) — e2e mutates a local DB only`,
    }
  }

  return { allowed: true, host }
}
