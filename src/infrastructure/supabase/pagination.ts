export const SUPABASE_PAGE_SIZE = 1000;

export interface SupabasePageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export type SupabasePageFetcher<T> = (
  from: number,
  to: number,
) => PromiseLike<SupabasePageResult<T>>;

/**
 * Fetch every row from a Supabase/PostgREST query using explicit range pages.
 *
 * Supabase projects commonly cap one API response at 1,000 rows. Consumers
 * such as Jadwal Kelas must therefore never assume a single select("*") is a
 * complete table snapshot. The caller supplies the filtered/ordered query for
 * each page; this helper only owns paging and error propagation.
 */
export async function fetchAllSupabasePages<T>(
  fetchPage: SupabasePageFetcher<T>,
  label: string,
  pageSize = SUPABASE_PAGE_SIZE,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error(`Invalid Supabase page size: ${pageSize}`);
  }

  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const result = await fetchPage(from, to);

    if (result.error) {
      throw new Error(`${label}: ${result.error.message}`);
    }

    const page = result.data || [];
    rows.push(...page);

    if (page.length < pageSize) {
      return rows;
    }

    from += pageSize;
  }
}
