import { invoke } from "@tauri-apps/api/core";

export type DetailLevel = "concise" | "standard" | "deep";
export type StudyIntent = "exam" | "long_term";
export type ModelTier = "cheap" | "balanced" | "premium";

export type SubjectOwnOptions = {
  newCardsPerDay: number | null;
  learningStepsMinutes: number[] | null;
  relearningStepsMinutes: number[] | null;
  desiredRetention: number | null;
  studyIntent: StudyIntent | null;
  examDate: string | null;
  detailLevel: DetailLevel | null;
  hintingEnabled: boolean | null;
};

export type SubjectEffectiveOptions = {
  newCardsPerDay: number;
  learningStepsMinutes: number[];
  relearningStepsMinutes: number[];
  desiredRetention: number;
};

export type SubjectStudyOptions = {
  own: SubjectOwnOptions;
  intent: { studyIntent: StudyIntent; examDate: string | null };
  effective: SubjectEffectiveOptions;
};

export type SubjectStudyOptionsPatch = Partial<{
  studyIntent: StudyIntent | null;
  examDate: string | null;
  desiredRetention: number | null;
  newCardsPerDay: number | null;
  learningStepsMinutes: number[] | null;
  relearningStepsMinutes: number[] | null;
  detailLevel: DetailLevel | null;
  hintingEnabled: boolean | null;
}>;

export type AdminSettings = {
  modelTier: ModelTier | null;
  newCardsPerDay: number | null;
  learningStepsMinutes: number[] | null;
  relearningStepsMinutes: number[] | null;
  desiredRetention: number | null;
};

export type AdminSettingsPatch = Partial<{
  modelTier: ModelTier;
  newCardsPerDay: number;
  learningStepsMinutes: number[];
  relearningStepsMinutes: number[];
  desiredRetention: number;
}>;

export type DailyGoal = { dailyReviewTarget: number | null };

export type Account = { email: string; name: string; lastSignInAt: string | null };

export function getSubjectStudyOptions(subjectId: string): Promise<SubjectStudyOptions> {
  return invoke<SubjectStudyOptions>("get_subject_study_options", { subjectId });
}

export function updateSubjectStudyOptions(
  subjectId: string,
  patch: SubjectStudyOptionsPatch,
): Promise<SubjectStudyOptions> {
  return invoke<SubjectStudyOptions>("update_subject_study_options", { subjectId, patch });
}

export function getAdminSettings(): Promise<AdminSettings> {
  return invoke<AdminSettings>("get_admin_settings");
}

export function updateAdminSettings(patch: AdminSettingsPatch): Promise<AdminSettings> {
  return invoke<AdminSettings>("update_admin_settings", { patch });
}

export function getDailyGoal(): Promise<DailyGoal> {
  return invoke<DailyGoal>("get_daily_goal");
}

export function saveDailyGoal(target: number | null): Promise<DailyGoal> {
  return invoke<DailyGoal>("save_daily_goal", { target });
}

export function getAccount(): Promise<Account> {
  return invoke<Account>("get_account");
}

export function updateAccountName(name: string): Promise<Account> {
  return invoke<Account>("update_account_name", { name });
}
