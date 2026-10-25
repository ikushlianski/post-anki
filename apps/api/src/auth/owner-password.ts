export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export type PasswordCheck = { ok: true } | { ok: false; reason: "too_short" | "too_long" | "mismatch" };

export function validateNewPassword(password: string, confirmation: string): PasswordCheck {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: "too_short" };
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, reason: "too_long" };
  }

  if (password !== confirmation) {
    return { ok: false, reason: "mismatch" };
  }

  return { ok: true };
}

export function describePasswordProblem(reason: "too_short" | "too_long" | "mismatch"): string {
  if (reason === "too_short") {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  if (reason === "too_long") {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  }

  return "Passwords do not match";
}
