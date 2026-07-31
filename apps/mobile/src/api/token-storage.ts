import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "post-anki-api-token";

export type ClearReason = "revoked";

type TokenListener = (token: string | null) => void;

const listeners = new Set<TokenListener>();

let lastClearReason: ClearReason | null = null;

function notify(token: string | null): void {
  for (const listener of listeners) {
    listener(token);
  }
}

export function subscribeToStoredToken(listener: TokenListener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export async function getStoredToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return window.localStorage.getItem(TOKEN_KEY);
  }

  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setStoredToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }

  notify(token);
}

export async function clearStoredToken(reason?: ClearReason): Promise<void> {
  lastClearReason = reason ?? null;

  if (Platform.OS === "web") {
    window.localStorage.removeItem(TOKEN_KEY);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }

  notify(null);
}

export function consumeClearReason(): ClearReason | null {
  const reason = lastClearReason;

  lastClearReason = null;

  return reason;
}
