import type { CreateSubjectResult } from "./create-subject.js";

type CreateSubjectFailure = Extract<CreateSubjectResult, { ok: false }>;

export function describeCreateSubjectFailure(failure: CreateSubjectFailure): string {
  switch (failure.reason) {
    case "empty_name":
      return "Type a name for the subject first.";
    case "unauthorized":
      return "The API rejected your token. Check it in the settings above.";
    case "network":
      return "The API could not be reached. Check the base URL and try again.";
    case "other":
      return "The API could not add the subject. Try again in a moment.";
  }
}
