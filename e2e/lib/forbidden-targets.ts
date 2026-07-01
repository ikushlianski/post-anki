export const FORBIDDEN_TARGETS: ReadonlySet<string> = new Set([
  'neon.tech',
  'aws.neon.tech',
  'pooler.supabase.com',
  'rds.amazonaws.com',
])

export const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
])
