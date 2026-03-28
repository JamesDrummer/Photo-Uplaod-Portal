/**
 * Shared retry helper with exponential backoff for network operations.
 *
 * Usage:
 *   const data = await withRetry(() => supabase.storage.from('x').list('y'), {
 *     maxAttempts: 3,
 *     label: 'list storage files',
 *   });
 */

export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in ms before the first retry (default: 1000). Doubles each retry. */
  baseDelayMs?: number;
  /** Human-readable label used in log messages (e.g. "upload thumbnail") */
  label?: string;
  /** If true, resolve with `undefined` instead of throwing on final failure (default: false) */
  silent?: boolean;
}

/**
 * Executes `fn` up to `maxAttempts` times with exponential backoff.
 *
 * The function can throw (or return a rejected promise) to signal a retryable
 * failure.  If the final attempt also fails the error is re-thrown (unless
 * `silent` is set, in which case `undefined` is returned).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    label = 'operation',
    silent = false,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === maxAttempts;

      if (isLastAttempt) {
        console.warn(
          `[retry] ${label} failed after ${maxAttempts} attempt(s):`,
          err,
        );
      } else {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[retry] ${label} attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms...`,
          err,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  if (silent) {
    return undefined as unknown as T;
  }

  throw lastError;
}

/**
 * Convenience wrapper for Supabase calls that return `{ data, error }`.
 * Converts the error branch into a thrown exception so `withRetry` can catch it,
 * then returns `data`.
 */
export async function withRetrySupabase<T>(
  fn: () => Promise<{ data: T; error: { message: string } | null }>,
  options: RetryOptions = {},
): Promise<T> {
  return withRetry(async () => {
    const { data, error } = await fn();
    if (error) {
      throw new Error(error.message);
    }
    return data;
  }, options);
}
