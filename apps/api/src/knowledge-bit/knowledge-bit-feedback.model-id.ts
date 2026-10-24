export async function resolveFeedbackModelId(sourceModelId: string | null): Promise<string | null> {
  if (sourceModelId) {
    return sourceModelId;
  }

  try {
    const { getKnowledgeItemModelId } = await import("../admin-settings/admin-settings.repo.js");

    return await getKnowledgeItemModelId();
  } catch {
    return null;
  }
}

export function clipText(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value.slice(0, max);
}
