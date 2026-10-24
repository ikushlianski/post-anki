export type CorsDecision =
  | { allowedOrigin: string }
  | { forbidden: true }
  | { noOrigin: true };

export interface CorsInput {
  requestOrigin: string | undefined;
  webOrigin: string;
  extensionId: string | undefined;
  extraOrigins?: string[];
}

export function resolveCorsDecision({
  requestOrigin,
  webOrigin,
  extensionId,
  extraOrigins,
}: CorsInput): CorsDecision {
  if (!requestOrigin) {
    return { noOrigin: true };
  }

  const allowList = [webOrigin];

  if (extensionId) {
    allowList.push(`chrome-extension://${extensionId}`);
  }

  if (extraOrigins) {
    allowList.push(...extraOrigins);
  }

  if (allowList.includes(requestOrigin)) {
    return { allowedOrigin: requestOrigin };
  }

  return { forbidden: true };
}
