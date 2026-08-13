// A "series with known parts" is any captured item whose discovery step
// (a GitHub book's chapter listing today; any future host-specific
// discoverer tomorrow) resolved a concrete, ordered list of parts. This
// type and the planning function below never look at where that list came
// from — no host, no URL shape, no file extension — so a second discovery
// source (e.g. an AWS guide index) can be wired in later purely by producing
// this same shape, with zero change here.
export interface SeriesPart {
  readonly url: string;
  readonly title: string;
}

export interface PlannedSeriesModule {
  readonly title: string;
  readonly url: string;
  readonly order: number;
}

// Turns a series' discovered parts into the modules a course should open
// with, in the book's own order. Blank/whitespace-only urls are dropped
// (nothing to fetch later), duplicate urls keep only their first occurrence
// (a discoverer that lists the same part twice must not double the course),
// and a part with no usable title still gets a stable, ordinal fallback
// name rather than being dropped — an untitled part is still a real part of
// the book.
export function planSeriesModules(parts: readonly SeriesPart[]): PlannedSeriesModule[] {
  const seenUrls = new Set<string>();
  const planned: PlannedSeriesModule[] = [];

  for (const part of parts) {
    const url = part.url.trim();

    if (url.length === 0 || seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);

    const title = part.title.trim();
    const order = planned.length + 1;

    planned.push({ title: title.length > 0 ? title : `Part ${order}`, url, order });
  }

  return planned;
}
