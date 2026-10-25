export class SearchRateLimitedError extends Error {
  constructor() {
    super("Too many meaning searches in a row.");
    this.name = "SearchRateLimitedError";
  }
}

export class EmbeddingFailedError extends Error {
  constructor(cause: unknown) {
    super("The meaning search service failed.", { cause });
    this.name = "EmbeddingFailedError";
  }
}
