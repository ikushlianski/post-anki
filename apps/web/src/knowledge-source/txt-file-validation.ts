export const MAX_TXT_FILE_BYTES = 900_000

export function checkTxtFile(file: { name: string; size: number }): string | null {
  if (!file.name.toLowerCase().endsWith('.txt')) return 'Only .txt files can be imported.'

  if (file.size === 0) return 'The file is empty.'

  if (file.size > MAX_TXT_FILE_BYTES) return 'The file is too large (limit 900 KB).'

  return null
}
