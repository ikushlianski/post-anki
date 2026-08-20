// Central place e2e-local actions read the local dev stack's coordinates
// from. Defaults match the ports `npm run dev` actually binds (see
// apps/web/package.json's "dev" script and apps/api/.env.local) — NOT the
// e2e/ Docker stack's dedicated ports (3120/8031), which are a separate,
// CI-shaped stack owned by verification-repo's project.json. e2e-local always
// targets whatever `npm run dev` is running, since its whole point is
// same-session dev-loop debugging.
export const WEB_BASE_URL = process.env.E2E_LOCAL_WEB_URL ?? 'http://localhost:3002';
export const API_BASE_URL = process.env.E2E_LOCAL_API_URL ?? 'http://localhost:8030';
export const API_SHARED_SECRET = process.env.API_SHARED_SECRET ?? 'local-dev-secret';

export function apiAuthHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${API_SHARED_SECRET}`,
    'content-type': 'application/json',
  };
}
