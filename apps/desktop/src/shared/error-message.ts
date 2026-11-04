export function errorMessage(reason: unknown, fallback: string): string {
  if (typeof reason === "string" && reason.length > 0) {
    return reason;
  }

  if (reason instanceof Error && reason.message.length > 0) {
    return reason.message;
  }

  return fallback;
}
