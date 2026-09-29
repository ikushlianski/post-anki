import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { curricula } from "../db/schema.js";

export async function curriculumExists(curriculumId: string): Promise<boolean> {
  const row = (
    await getDb().select({ id: curricula.id }).from(curricula).where(eq(curricula.id, curriculumId))
  )[0];

  return row !== undefined;
}
