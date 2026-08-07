export type SequentialResult<T> =
  | { file: File; ok: true; value: T }
  | { file: File; ok: false; error: string };

export async function runSequentially<T>(
  files: File[],
  process: (file: File) => Promise<T>,
): Promise<SequentialResult<T>[]> {
  const results: SequentialResult<T>[] = [];
  for (const file of files) {
    try {
      results.push({ file, ok: true, value: await process(file) });
    } catch (error) {
      results.push({
        file,
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  return results;
}

export function summariseResults<T>(results: SequentialResult<T>[]) {
  const succeeded = results.filter((result): result is Extract<SequentialResult<T>, { ok: true }> => result.ok);
  const failed = results.filter((result): result is Extract<SequentialResult<T>, { ok: false }> => !result.ok);
  return {
    allSucceeded: failed.length === 0,
    successMessage: succeeded.length > 0
      ? `Uploaded ${succeeded.length} of ${results.length} files: ${succeeded.map(result => result.file.name).join(', ')}.`
      : '',
    errorMessage: failed.length > 0
      ? `Failed: ${failed.map(result => `${result.file.name} — ${result.error}`).join('; ')}`
      : '',
  };
}

export function filesForRetry<T>(results: SequentialResult<T>[]): File[] {
  return results.filter(result => !result.ok).map(result => result.file);
}

export function isDuplicateStorageError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: number; statusCode?: string | number; message?: string };
  return Number(candidate.status ?? candidate.statusCode) === 409 || /duplicate|already exists/i.test(candidate.message ?? '');
}

export function createStableUploadPrefixFactory(
  generate: () => string = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
): (file: File) => string {
  const prefixes = new WeakMap<File, string>();
  return (file: File) => {
    const existing = prefixes.get(file);
    if (existing) return existing;
    const created = generate();
    prefixes.set(file, created);
    return created;
  };
}
