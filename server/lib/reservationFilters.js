/**
 * Reservation query builder.
 * Translates query string params into a Supabase filter chain.
 *
 * Supported filters:
 *   - source: 'EMAIL' | 'WHATSAPP' | 'WEBSITE' | 'IN_PERSON' | 'all'
 *   - status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'all'
 *   - search: free-text on customer_name (uses ilike)
 *   - dateFrom / dateTo: ISO strings (filter on start_date)
 *   - priceMin / priceMax: numbers (filter on total_price)
 *
 * Sorting (whitelist enforced to prevent SQL injection):
 *   - sort: 'created_at' | 'start_date' | 'total_price' | 'customer_name'
 *   - order: 'asc' | 'desc' (default 'desc')
 *
 * Pagination:
 *   - page: 1-indexed (default 1)
 *   - pageSize: max 100, default 25
 *
 * Returns: { query, page, pageSize } — caller awaits the chained query.
 */
export function applyReservationFilters(query, params = {}) {
  const {
    source, status, search,
    dateFrom, dateTo, priceMin, priceMax,
    sort = 'created_at', order = 'desc',
    page = 1, pageSize = 25,
  } = params

  // ── Channel + status filters ─────────────────────────
  if (source && source !== 'all') query = query.eq('source_channel', source)
  if (status && status !== 'all') query = query.eq('status', status)

  // ── Customer name search (ilike for case-insensitive partial match) ──
  if (typeof search === 'string' && search.trim()) {
    query = query.ilike('customer_name', `%${search.trim()}%`)
  }

  // ── Date range (filter on start_date) ─────────────────
  if (dateFrom) query = query.gte('start_date', dateFrom)
  if (dateTo)   query = query.lte('start_date', dateTo)

  // ── Price range ──────────────────────────────────────
  if (priceMin !== undefined && priceMin !== null && priceMin !== '') {
    query = query.gte('total_price', Number(priceMin))
  }
  if (priceMax !== undefined && priceMax !== null && priceMax !== '') {
    query = query.lte('total_price', Number(priceMax))
  }

  // ── Sorting (whitelist) ──────────────────────────────
  const ALLOWED_SORTS = new Set(['created_at', 'start_date', 'total_price', 'customer_name'])
  const sortCol = ALLOWED_SORTS.has(sort) ? sort : 'created_at'
  query = query.order(sortCol, { ascending: order === 'asc' })

  // ── Pagination (clamped) ─────────────────────────────
  const ps = Math.min(Math.max(Number(pageSize) || 25, 1), 100)
  const pageNum = Math.max(Number(page) || 1, 1)
  const from = (pageNum - 1) * ps
  const to   = from + ps - 1
  query = query.range(from, to)

  return { query, page: pageNum, pageSize: ps }
}
