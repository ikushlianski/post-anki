export class SubjectHasNotionSourcesError extends Error {
  constructor() {
    super("Subject still has Notion sources; move or delete them first");
    this.name = "SubjectHasNotionSourcesError";
  }
}
