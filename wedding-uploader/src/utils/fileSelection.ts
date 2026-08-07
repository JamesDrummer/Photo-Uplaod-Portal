export const MAX_FILES_PER_BATCH = 5;
export const IMAGE_MAX_BYTES = 30 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export type SelectedFileKind = 'image' | 'gif' | 'video' | 'unsupported';
export type VideoContainer = 'iso-video' | 'quicktime' | 'ebml' | 'image-bmff' | 'unknown';
export interface RejectedFile { file: File; reason: string }
export interface ValidatedFile { file: File; kind: Exclude<SelectedFileKind, 'unsupported'> }

const EXTENSION_KIND: Record<string, Exclude<SelectedFileKind, 'unsupported'>> = {
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', bmp: 'image', heic: 'image', heif: 'image',
  gif: 'gif',
  mp4: 'video', mov: 'video', m4v: 'video', webm: 'video', mkv: 'video',
};

const MIME_KIND: Record<string, Exclude<SelectedFileKind, 'unsupported'>> = {
  'image/jpeg': 'image', 'image/jpg': 'image', 'image/png': 'image', 'image/webp': 'image',
  'image/bmp': 'image', 'image/heic': 'image', 'image/heif': 'image', 'image/gif': 'gif',
  'video/mp4': 'video', 'video/quicktime': 'video', 'video/x-m4v': 'video',
  'video/webm': 'video', 'video/x-matroska': 'video',
};

const MIME_BY_EXTENSION: Record<string, Set<string>> = {
  jpg: new Set(['image/jpeg', 'image/jpg']), jpeg: new Set(['image/jpeg', 'image/jpg']),
  png: new Set(['image/png']), webp: new Set(['image/webp']), bmp: new Set(['image/bmp']),
  heic: new Set(['image/heic', 'image/heif']), heif: new Set(['image/heic', 'image/heif']),
  gif: new Set(['image/gif']), mp4: new Set(['video/mp4', 'video/quicktime']), mov: new Set(['video/quicktime', 'video/mp4']),
  m4v: new Set(['video/x-m4v', 'video/mp4']), webm: new Set(['video/webm']), mkv: new Set(['video/x-matroska']),
};

function extension(name: string) {
  return name.toLowerCase().split('.').pop() ?? '';
}

export function classifyFile(file: File): SelectedFileKind {
  const ext = extension(file.name);
  const mime = file.type.toLowerCase();
  const kindFromExtension = EXTENSION_KIND[ext];
  const kindFromMime = MIME_KIND[mime];
  const hasNeutralMime = mime === '' || mime === 'application/octet-stream';

  if (!hasNeutralMime && !kindFromMime) return 'unsupported';
  if (kindFromExtension && !hasNeutralMime && !MIME_BY_EXTENSION[ext]?.has(mime)) return 'unsupported';
  return kindFromExtension ?? kindFromMime ?? 'unsupported';
}

function readPrefix(file: File, length = 16): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new Error(`Could not inspect ${file.name}.`));
    reader.readAsArrayBuffer(file.slice(0, length));
  });
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export async function detectVideoContainer(file: File): Promise<VideoContainer> {
  const bytes = await readPrefix(file);
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'ebml';
  if (bytes.length < 12 || ascii(bytes, 4, 4) !== 'ftyp') return 'unknown';
  const brand = ascii(bytes, 8, 4);
  if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'avif', 'avis'].includes(brand)) return 'image-bmff';
  if (brand === 'qt  ') return 'quicktime';
  return 'iso-video';
}

export async function hasValidFileSignature(file: File, kind: ValidatedFile['kind']): Promise<boolean> {
  const bytes = await readPrefix(file);
  if (kind === 'gif') return ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a';

  if (kind === 'video') {
    const container = await detectVideoContainer(file);
    const ext = extension(file.name);
    if (ext === 'webm' || ext === 'mkv') return container === 'ebml';
    if (ext === 'mp4' || ext === 'm4v' || ext === 'mov') return container === 'iso-video' || container === 'quicktime';
    if (file.type === 'video/webm' || file.type === 'video/x-matroska') return container === 'ebml';
    return container === 'iso-video' || container === 'quicktime';
  }

  const hasFtyp = bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp';
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG';
  const isWebp = ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP';
  const isBmp = ascii(bytes, 0, 2) === 'BM';
  const heifBrand = hasFtyp ? ascii(bytes, 8, 4) : '';
  const isHeif = ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(heifBrand);
  return isJpeg || isPng || isWebp || isBmp || isHeif;
}

export function validateSelection(files: File[]): { accepted: ValidatedFile[]; rejected: RejectedFile[] } {
  const accepted: ValidatedFile[] = [];
  const rejected: RejectedFile[] = [];

  files.forEach((file, index) => {
    if (index >= MAX_FILES_PER_BATCH) {
      rejected.push({ file, reason: `${file.name}: a maximum of 5 files can be uploaded at once.` });
      return;
    }
    const kind = classifyFile(file);
    if (kind === 'unsupported') {
      rejected.push({ file, reason: `${file.name}: this file type is not supported or its type does not match its filename.` });
      return;
    }
    const limit = kind === 'video' ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
    if (file.size > limit) {
      rejected.push({ file, reason: `${file.name}: ${kind === 'video' ? 'videos must be 50 MB or smaller' : 'images and GIFs must be 30 MB or smaller'}.` });
      return;
    }
    accepted.push({ file, kind });
  });

  return { accepted, rejected };
}
