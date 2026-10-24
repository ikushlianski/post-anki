import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

export interface ReextractArgs {
  apply: boolean;
  allowRemote: boolean;
  subjectId: string | undefined;
}

export function parseReextractArgs(argv: readonly string[]): ReextractArgs {
  const subjectIndex = argv.indexOf("--subject");
  const subjectId = subjectIndex === -1 ? undefined : argv[subjectIndex + 1];

  if (subjectIndex !== -1 && (!subjectId || subjectId.startsWith("--"))) {
    throw new Error("--subject needs a subject id");
  }

  return {
    apply: argv.includes("--apply"),
    allowRemote: argv.includes("--allow-remote"),
    subjectId,
  };
}

export function assertReextractTarget(databaseUrl: string | undefined, allowRemote: boolean): void {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  if (!allowRemote) {
    assertLocalDbTarget(databaseUrl);
  }
}
