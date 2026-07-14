export function mockDocsSiteBaseUrl(): string {
  const port = process.env.E2E_MOCK_DOCS_PORT ?? '4998'

  return `http://localhost:${port}`
}

export function uniqueTechnologyName(seed: number): string {
  return `E2E Technology ${seed}`
}
