import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')

try {
  process.loadEnvFile(join(here, '.env'))
} catch {
  // e2e/.env is optional when the env is already exported (e.g. CI).
}

const apiPort = process.env.E2E_API_PORT ?? '8031'
const webPort = process.env.E2E_WEB_PORT ?? '3100'
const mockLlmPort = process.env.E2E_MOCK_LLM_PORT ?? '4999'
const baseURL =
  process.env.PROJECT_DEV_SERVER_URL ?? `http://localhost:${webPort}`
const sharedSecret = process.env.API_SHARED_SECRET ?? 'e2e-local-secret'

export default defineConfig({
  testDir: './features',
  testMatch: ['**/tests/**/test.ts'],
  globalSetup: './global-setup.ts',
  outputDir: './test-results',
  reporter: [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: process.env.HEADED !== 'true',
    launchOptions: {
      slowMo: process.env.SLOWMO
        ? Number(process.env.SLOWMO)
        : process.env.HEADED === 'true'
          ? 500
          : 0,
    },
  },
  webServer: [
    {
      command: 'npx tsx e2e/mock-openrouter/server.ts',
      cwd: repoRoot,
      url: `http://localhost:${mockLlmPort}/healthz`,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: mockLlmPort,
      },
    },
    {
      command: 'npm run start -w @post-anki/api',
      cwd: repoRoot,
      url: `http://localhost:${apiPort}/healthz`,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: apiPort,
        DATABASE_URL: process.env.E2E_DATABASE_URL ?? '',
        API_SHARED_SECRET: sharedSecret,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? 'e2e-unused',
        OPENROUTER_BASE_URL: `http://localhost:${mockLlmPort}/v1`,
        CURRICULUM_MODEL:
          process.env.CURRICULUM_MODEL ?? 'openrouter/openai/gpt-4o-mini',
        LANGFUSE_PUBLIC_KEY: '',
        LANGFUSE_SECRET_KEY: '',
        LOG_LEVEL: process.env.LOG_LEVEL ?? 'warn',
      },
    },
    {
      command: 'npm run dev:e2e -w @post-anki/web',
      cwd: repoRoot,
      port: Number(webPort),
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: {
        API_BASE_URL: `http://localhost:${apiPort}`,
        API_SHARED_SECRET: sharedSecret,
      },
    },
  ],
})
