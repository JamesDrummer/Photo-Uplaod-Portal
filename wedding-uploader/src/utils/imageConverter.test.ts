import { describe, expect, it, vi } from 'vitest';

vi.mock('heic2any', () => ({ default: vi.fn() }));

import { convertHeicToJpeg } from './imageConverter';

describe('convertHeicToJpeg failures', () => {
  it('fails the individual file rather than uploading an unrenderable original', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const source = new File([
      new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]),
    ], 'photo.heic', { type: 'image/heic' });
    const failingConverter = async () => { throw new Error('unsupported HEIC variant'); };

    await expect(convertHeicToJpeg(source, 0.8, failingConverter)).rejects.toThrow(/could not convert photo\.heic/i);
  });
});
