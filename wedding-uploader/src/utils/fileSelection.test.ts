import { describe, expect, it } from 'vitest';
import { classifyFile, hasValidFileSignature, validateSelection, IMAGE_MAX_BYTES, VIDEO_MAX_BYTES } from './fileSelection';

const file = (name: string, type = '', size = 1) => new File([new Uint8Array(size)], name, { type });

describe('classifyFile', () => {
  it.each([
    ['photo.jpg', 'image/jpeg', 'image'],
    ['photo.PNG', '', 'image'],
    ['iphone.heic', '', 'image'],
    ['iphone.heif', 'image/heif', 'image'],
    ['dance.gif', 'image/gif', 'gif'],
    ['clip.mp4', 'video/mp4', 'video'],
    ['iphone.MOV', '', 'video'],
    ['iphone.MOV', 'video/mp4', 'video'],
    ['clip.webm', '', 'video'],
  ] as const)('classifies %s', (name, type, expected) => {
    expect(classifyFile(file(name, type))).toBe(expected);
  });

  it('rejects unsupported MIME and extensions', () => {
    expect(classifyFile(file('notes.pdf', 'application/pdf'))).toBe('unsupported');
  });

  it('rejects an allowlisted extension paired with a hostile or conflicting MIME type', () => {
    expect(classifyFile(file('payload.gif', 'text/html'))).toBe('unsupported');
    expect(classifyFile(file('payload.gif', 'image/png'))).toBe('unsupported');
  });
});

describe('hasValidFileSignature', () => {
  it('accepts genuine GIF, JPEG and MP4 signatures', async () => {
    const gif = new File([new TextEncoder().encode('GIF89a')], 'photo.gif', { type: 'image/gif' });
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'photo.jpg', { type: 'image/jpeg' });
    const mp4 = new File([new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])], 'clip.mp4', { type: 'video/mp4' });
    await expect(hasValidFileSignature(gif, 'gif')).resolves.toBe(true);
    await expect(hasValidFileSignature(jpeg, 'image')).resolves.toBe(true);
    await expect(hasValidFileSignature(mp4, 'video')).resolves.toBe(true);
  });

  it('rejects active content disguised as a GIF', async () => {
    const spoofed = new File([new TextEncoder().encode('<html><script>')], 'payload.gif', { type: 'image/gif' });
    await expect(hasValidFileSignature(spoofed, 'gif')).resolves.toBe(false);
  });

  it('rejects EBML and image-only BMFF containers disguised as MP4 video', async () => {
    const ebml = new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], 'clip.mp4', { type: 'video/mp4' });
    const heic = new File([new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])], 'clip.mp4', { type: 'video/mp4' });
    await expect(hasValidFileSignature(ebml, 'video')).resolves.toBe(false);
    await expect(hasValidFileSignature(heic, 'video')).resolves.toBe(false);
  });
});

describe('validateSelection', () => {
  it('caps batches at five and explicitly rejects the remainder', () => {
    const result = validateSelection(Array.from({ length: 6 }, (_, i) => file(`${i}.jpg`, 'image/jpeg')));
    expect(result.accepted).toHaveLength(5);
    expect(result.rejected[0].reason).toContain('maximum of 5');
  });

  it('rejects oversized videos and images before processing', () => {
    const result = validateSelection([
      file('large.mov', '', VIDEO_MAX_BYTES + 1),
      file('large.gif', 'image/gif', IMAGE_MAX_BYTES + 1),
    ]);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected.map(({ reason }) => reason)).toEqual([
      expect.stringContaining('50 MB'),
      expect.stringContaining('30 MB'),
    ]);
  });
});
