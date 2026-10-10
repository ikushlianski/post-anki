export type CorsDecision =
  | { allowedOrigin: string }
  | { forbidden: true }
  | { noOrigin: true };

export interface CorsInput {
  requestOrigin: string | undefined;
  webOrigin: string;
  extensionId: string | undefined;
}

export function resolveCorsDecision({
  requestOrigin,
  webOrigin,
  extensionId,
}: CorsInput): CorsDecision {
  if (!requestOrigin) {
    return { noOrigin: true };
  }

  const allowList = [webOrigin];

  if (extensionId) {
    allowList.push(`chrome-extension://${extensionId}`);
  }

  if (allowList.includes(requestOrigin)) {
    return { allowedOrigin: requestOrigin };
  }

  return { forbidden: true };
}
