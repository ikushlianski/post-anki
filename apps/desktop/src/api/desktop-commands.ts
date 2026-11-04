import { invoke } from "@tauri-apps/api/core";

export type Subject = { id: string; name: string; parentId: string | null };

export type Credentials = { email: string; password: string };

export function hasSession(): Promise<boolean> {
  return invoke<boolean>("has_session");
}

export function signIn({ email, password }: Credentials): Promise<void> {
  return invoke<void>("sign_in", { email, password });
}

export function signOut(): Promise<void> {
  return invoke<void>("sign_out");
}

export function getSubjects(): Promise<Subject[]> {
  return invoke<Subject[]>("get_subjects");
}
