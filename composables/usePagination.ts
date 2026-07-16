export type PaginationItem
  = | { type: 'page'; key: string; page: number }
    | { type: 'ellipsis'; key: string };

/**
 * Shared pagination composable used by ContributorsTab and TasksTab.
 *
 * @param getItems      - Getter returning the full (already-filtered/sorted) list to paginate.
 * @param getPageSize   - Getter returning the current page size.
 * @param maxVisibleButtons - Maximum numbered buttons before collapsing with ellipses (default 7).
 */
export function usePagination<T>(
  getItems: () => T[],
  getPageSize: () => number,
  maxVisibleButtons = 7,
) {
  const currentPage = ref(1);

  const totalPages = computed(() =>
    Math.max(1, Math.ceil(getItems().length / getPageSize())),
  );

  const paginatedItems = computed(() => {
    const pageSize = getPageSize();
    const start = (currentPage.value - 1) * pageSize;
    return getItems().slice(start, start + pageSize);
  });

  const visiblePaginationItems = computed<PaginationItem[]>(() => {
    const pages = totalPages.value;

    if (pages <= maxVisibleButtons) {
      return Array.from({ length: pages }, (_, index) => ({
        type: 'page' as const,
        key: `page-${index + 1}`,
        page: index + 1,
      }));
    }

    const firstPage = 1;
    const lastPage = pages;
    const current = currentPage.value;
    const interiorSlots = maxVisibleButtons - 2;
    let windowStart = Math.max(firstPage + 1, current - Math.floor(interiorSlots / 2));
    let windowEnd = windowStart + interiorSlots - 1;

    if (windowEnd >= lastPage) {
      windowEnd = lastPage - 1;
      windowStart = windowEnd - interiorSlots + 1;
    }

    const items: PaginationItem[] = [
      { type: 'page', key: `page-${firstPage}`, page: firstPage },
    ];

    if (windowStart > firstPage + 1) {
      items.push({ type: 'ellipsis', key: 'ellipsis-start' });
    }

    for (let page = windowStart; page <= windowEnd; page += 1) {
      items.push({ type: 'page', key: `page-${page}`, page });
    }

    if (windowEnd < lastPage - 1) {
      items.push({ type: 'ellipsis', key: 'ellipsis-end' });
    }

    items.push({ type: 'page', key: `page-${lastPage}`, page: lastPage });

    return items;
  });

  // Clamp currentPage when the total shrinks (e.g. items are filtered or removed).
  watch(totalPages, (pageCount) => {
    if (currentPage.value > pageCount) {
      currentPage.value = pageCount;
    }
  });

  return { currentPage, totalPages, paginatedItems, visiblePaginationItems };
}
