import { useCallback, useEffect, useState } from "react";
import type { ListPage, ListRow } from "@/api/triage-commands";
import { errorMessage } from "@/shared/error-message";

type Status = "loading" | "ready" | "error";

export function useTriageRows(loadPage: (offset: number) => Promise<ListPage>) {
  const [rows, setRows] = useState<ListRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (offset: number) => {
      try {
        const page = await loadPage(offset);

        setRows((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
        setHasMore(page.hasMore);
        setStatus("ready");
        setError(null);
      } catch (reason) {
        setError(errorMessage(reason, "Could not load these items."));
        setStatus("error");
      }
    },
    [loadPage],
  );

  useEffect(() => {
    void fetchPage(0);
  }, [fetchPage]);

  const reload = useCallback(() => {
    setStatus("loading");

    return fetchPage(0);
  }, [fetchPage]);

  const loadMore = useCallback(() => fetchPage(rows.length), [fetchPage, rows.length]);

  const removeRows = useCallback((ids: readonly string[]) => {
    setRows((prev) => prev.filter((row) => !ids.includes(row.id)));
  }, []);

  return { rows, hasMore, status, error, reload, loadMore, removeRows };
}
