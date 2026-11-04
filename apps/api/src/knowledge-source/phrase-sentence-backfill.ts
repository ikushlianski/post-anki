export interface PhraseBackfillArgs {
  apply: boolean;
  allowRemote: boolean;
  splitOnly: boolean;
  limit: number | undefined;
}

export function parsePhraseBackfillArgs(argv: readonly string[]): PhraseBackfillArgs {
  const limitIndex = argv.indexOf("--limit");
  const rawLimit = limitIndex === -1 ? undefined : argv[limitIndex + 1];
  const limit = rawLimit === undefined ? undefined : Number(rawLimit);

  if (limitIndex !== -1 && (limit === undefined || !Number.isInteger(limit) || limit < 1)) {
    throw new Error("--limit needs a positive whole number");
  }

  return {
    apply: argv.includes("--apply"),
    allowRemote: argv.includes("--allow-remote"),
    splitOnly: argv.includes("--split-only"),
    limit,
  };
}

export function splitPromptContext(prompt: string): { prompt: string; context: string } | null {
  const lines = prompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const [first, second] = lines;

  if (lines.length !== 2 || first === undefined || second === undefined) {
    return null;
  }

  return { prompt: first, context: second };
}
