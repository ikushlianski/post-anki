const SHAPE_PATH = '/api/electric-shape'
const SERVER_FALLBACK_ORIGIN = 'http://localhost'

export function electricShapeUrl(origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : SERVER_FALLBACK_ORIGIN)

  return new URL(SHAPE_PATH, base).toString()
}
