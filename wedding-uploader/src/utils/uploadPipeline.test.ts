import { describe, expect, it } from 'vitest';
import { createStableUploadPrefixFactory, filesForRetry, isDuplicateStorageError, runSequentially, summariseResults } from './uploadPipeline';

describe('runSequentially', () => {
  it('processes one file at a time in selection order', async () => {
    let active = 0;
    let maximumActive = 0;
    const order: string[] = [];
    const files = ['one.jpg', 'two.jpg'].map(name => new File(['x'], name));

    const results = await runSequentially(files, async file => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      order.push(`start:${file.name}`);
      await Promise.resolve();
      order.push(`end:${file.name}`);
      active -= 1;
      return file.name;
    });

    expect(maximumActive).toBe(1);
    expect(order).toEqual(['start:one.jpg', 'end:one.jpg', 'start:two.jpg', 'end:two.jpg']);
    expect(results.every(result => result.ok)).toBe(true);
  });

  it('continues after a per-file failure and preserves filenames and outcomes', async () => {
    const files = ['good.jpg', 'bad.jpg', 'also-good.jpg'].map(name => new File(['x'], name));
    const results = await runSequentially(files, async file => {
      if (file.name === 'bad.jpg') throw new Error('network unavailable');
      return file.name;
    });

    expect(results).toEqual([
      { file: files[0], ok: true, value: 'good.jpg' },
      { file: files[1], ok: false, error: 'network unavailable' },
      { file: files[2], ok: true, value: 'also-good.jpg' },
    ]);
  });

  it('summarises partial success without calling the whole batch a failure', () => {
    const good = new File(['x'], 'good.jpg');
    const bad = new File(['x'], 'bad.jpg');
    expect(summariseResults([
      { file: good, ok: true, value: 'good.jpg' },
      { file: bad, ok: false, error: 'network unavailable' },
    ])).toEqual({
      allSucceeded: false,
      successMessage: 'Uploaded 1 of 2 files: good.jpg.',
      errorMessage: 'Failed: bad.jpg — network unavailable',
    });
  });

  it('retains only unsuccessful files for a safe retry', () => {
    const good = new File(['x'], 'good.jpg');
    const bad = new File(['x'], 'bad.jpg');
    expect(filesForRetry([
      { file: good, ok: true, value: 'good.jpg' },
      { file: bad, ok: false, error: 'network unavailable' },
    ])).toEqual([bad]);
  });

  it('reuses a stable per-file upload prefix across retries', () => {
    let counter = 0;
    const getPrefix = createStableUploadPrefixFactory(() => `id-${++counter}`);
    const first = new File(['x'], 'first.jpg');
    const second = new File(['x'], 'second.jpg');
    expect(getPrefix(first)).toBe('id-1');
    expect(getPrefix(first)).toBe('id-1');
    expect(getPrefix(second)).toBe('id-2');
  });

  it('recognises an existing stable Storage object as an idempotent retry', () => {
    expect(isDuplicateStorageError({ statusCode: '409', message: 'The resource already exists' })).toBe(true);
    expect(isDuplicateStorageError({ status: 409, message: 'Duplicate' })).toBe(true);
    expect(isDuplicateStorageError({ statusCode: '500', message: 'Internal error' })).toBe(false);
  });
});
