// Storybook stand-in for @tauri-apps/api/core. A story supplies canned responses through
// parameters.tauriMocks: a value is returned as-is, a function is called with the invoke args,
// and { __error: reason } rejects with reason. Commands with no mock fall back to CANNED_RESPONSES,
// then reject so a missing mock fails loudly.

export type TauriMocks = Record<string, unknown>;

type TauriMockFn = (args?: Record<string, unknown>) => unknown;

type ErrorMock = { __error: unknown };

type ActiveMocks = { token: symbol; mocks: TauriMocks };

const CANNED_RESPONSES: Record<string, unknown> = {
  has_session: true,
  get_subjects: [],
  get_review_due_counts: {},
};

let active: ActiveMocks | null = null;

export function setTauriMocks(mocks: TauriMocks): symbol {
  const token = Symbol("tauri-mocks");

  active = { token, mocks };

  return token;
}

export function clearTauriMocks(token: symbol): void {
  if (active?.token === token) {
    active = null;
  }
}

function isErrorMock(value: unknown): value is ErrorMock {
  return typeof value === "object" && value !== null && "__error" in value;
}

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const mocks = active?.mocks ?? {};
  let value: unknown;

  if (command in mocks) {
    const mock = mocks[command];

    value = typeof mock === "function" ? (mock as TauriMockFn)(args) : mock;
  } else if (command in CANNED_RESPONSES) {
    value = CANNED_RESPONSES[command];
  } else {
    throw new Error(`No Storybook mock for Tauri command "${command}". Add it to parameters.tauriMocks.`);
  }

  if (isErrorMock(value)) {
    throw value.__error;
  }

  return value as T;
}
