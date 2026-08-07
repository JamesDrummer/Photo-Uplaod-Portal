import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateVideoDimensions, getVideoResolution, needsCompatibilityTranscode, needsVideoTranscode, withAbortableTimeout, withTimeout } from './videoConverter';

describe('needsVideoTranscode', () => {
  it.each([
    [1280, 720, false],
    [720, 1280, false],
    [720, 720, false],
    [1281, 720, true],
    [720, 1281, true],
    [1080, 1920, true],
  ])('returns %s x %s => %s', (width, height, expected) => {
    expect(needsVideoTranscode(width, height)).toBe(expected);
  });
});

describe('calculateVideoDimensions', () => {
  it.each([
    [1920, 1080, { width: 1280, height: 720 }],
    [1080, 1920, { width: 720, height: 1280 }],
    [1024, 768, { width: 960, height: 720 }],
  ])('fits %s x %s inside the correct 720p bounds', (width, height, expected) => {
    expect(calculateVideoDimensions(width, height)).toEqual(expected);
  });
});

describe('needsCompatibilityTranscode', () => {
  it.each([
    ['clip.mov', 'quicktime', true],
    ['clip.m4v', 'iso-video', true],
    ['clip.webm', 'ebml', true],
    ['clip.mp4', 'ebml', true],
    ['clip.mp4', 'iso-video', false],
  ] as const)('returns %s in %s => %s', (name, container, expected) => {
    expect(needsCompatibilityTranscode(name, container)).toBe(expected);
  });
});

describe('getVideoResolution', () => {
  afterEach(() => vi.useRealTimers());

  it('revokes its object URL after metadata loads', async () => {
    const video = { preload: '', src: '', videoWidth: 1280, videoHeight: 720, onloadedmetadata: null as null | (() => void), onerror: null as null | (() => void) };
    vi.spyOn(document, 'createElement').mockReturnValue(video as unknown as HTMLVideoElement);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const result = getVideoResolution(new File(['x'], 'clip.mov'));
    video.onloadedmetadata?.();
    await expect(result).resolves.toEqual({ width: 1280, height: 720 });
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });

  it('times out and revokes its object URL', async () => {
    vi.useFakeTimers();
    const video = { preload: '', src: '', videoWidth: 0, videoHeight: 0, onloadedmetadata: null, onerror: null };
    vi.spyOn(document, 'createElement').mockReturnValue(video as unknown as HTMLVideoElement);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:timeout');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const result = getVideoResolution(new File(['x'], 'clip.mov'), 100);
    const rejection = expect(result).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(revoke).toHaveBeenCalledWith('blob:timeout');
  });
});

describe('withTimeout', () => {
  afterEach(() => vi.useRealTimers());

  it('rejects stalled work and runs its timeout cleanup', async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const result = withTimeout(new Promise<never>(() => undefined), 100, 'Video processing timed out.', onTimeout);
    const rejection = expect(result).rejects.toThrow('Video processing timed out');
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(onTimeout).toHaveBeenCalledOnce();
  });
});

describe('withAbortableTimeout', () => {
  afterEach(() => vi.useRealTimers());

  it('aborts the underlying operation before rejecting', async () => {
    vi.useFakeTimers();
    let operationSignal: AbortSignal | undefined;
    const result = withAbortableTimeout(signal => {
      operationSignal = signal;
      return new Promise<never>(() => undefined);
    }, 100, 'Download timed out.');
    const rejection = expect(result).rejects.toThrow('Download timed out');
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(operationSignal?.aborted).toBe(true);
  });
});
