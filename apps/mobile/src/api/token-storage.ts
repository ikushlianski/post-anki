import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "post-anki-api-token";

type TokenListener = (token: string | null) => void;

const listeners = new Set<TokenListener>();

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
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setStoredToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  notify(token);
}

export async function clearStoredToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  notify(null);
}
