/**
 * Build the structured log payload for the global Express error handler.
 *
 * Captures the fields that actually matter for diagnosing production 500s:
 *
 *   - method / path       — locates the failing endpoint
 *   - message             — human-readable summary
 *   - code                — Postgres SQLSTATE or library error code (e.g.
 *                           '42703' = column doesn't exist, '23505' = unique
 *                           violation). The single most useful field for
 *                           Supabase / pg errors.
 *   - details / hint      — Postgres-provided context, often pinpoints the
 *                           offending column or constraint
 *   - status              — HTTP status the route intended (if set)
 *   - stack               — truncated to the top 5 frames; full stacks waste
 *                           Railway log lines without adding signal
 *
 * Pure function — never throws. Safe to call from inside the error handler.
 *
 * Security: this object is for SERVER LOGS ONLY. The client still receives
 * the generic "Internal server error" message from the handler.
 */
export function formatApiErrorLog(err, req) {
  const safe = (v) => (v === undefined ? null : v)
  const stackTop = typeof err?.stack === 'string'
    ? err.stack.split('\n').slice(0, 5).join('\n')
    : null

  return {
    method:   req?.method ?? null,
    path:     req?.path ?? null,
    message:  safe(err?.message),
    code:     safe(err?.code),         // Supabase / pg SQLSTATE
    details:  safe(err?.details),      // Supabase: usually the offending value
    hint:     safe(err?.hint),         // Supabase: human-readable suggestion
    status:   safe(err?.status ?? err?.statusCode),
    stack:    stackTop,
  }
}
