export const IMPORT_BACKFILL_DEFAULT_LIMIT = 25;

export interface ImportBackfillArgs {
  apply: boolean;
  allowRemote: boolean;
  limit: number;
}

export function parseImportBackfillArgs(argv: readonly string[]): ImportBackfillArgs {
  const limitIndex = argv.indexOf("--limit");
  const limit = limitIndex === -1 ? IMPORT_BACKFILL_DEFAULT_LIMIT : Number(argv[limitIndex + 1]);

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("--limit needs a positive whole number");
  }

  return {
    apply: argv.includes("--apply"),
    allowRemote: argv.includes("--allow-remote"),
    limit,
  };
}
