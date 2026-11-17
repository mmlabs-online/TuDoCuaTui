import { useState } from "react";

export const GRID_PAGE_SIZE = 12;

/** Shows the first `pageSize` entries of `list`; `showMore` adds another page. Starts over when `resetKey` changes. */
export function useProgressiveList<T>(list: T[], resetKey: string, pageSize = GRID_PAGE_SIZE) {
  const [limit, setLimit] = useState(pageSize);
  const [prevKey, setPrevKey] = useState(resetKey);
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setLimit(pageSize);
  }
  return {
    shown: list.slice(0, limit),
    hasMore: list.length > limit,
    showMore: () => setLimit((l) => l + pageSize),
  };
}
