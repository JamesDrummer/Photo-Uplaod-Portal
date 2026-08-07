import { FFmpeg } from '@ffmpeg/ffmpeg';
import { detectVideoContainer, VideoContainer } from './fileSelection';
import { withRetry } from './retry';

let ffmpeg: FFmpeg | null = null;

export function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { onTimeout?.(); } catch { /* best-effort cleanup */ }
      reject(new Error(message));
    }, timeoutMs);

    work.then(
      value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function withAbortableTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  const controller = new AbortController();
  return withTimeout(operation(controller.signal), timeoutMs, message, () => {
    controller.abort();
    onTimeout?.();
  });
}

async function fetchToBlobURL(url: string, mimeType: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Encoder download failed with HTTP ${response.status}.`);
  const bytes = await response.arrayBuffer();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

function readFileAbortably(file: File, signal: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    const cleanup = () => signal.removeEventListener('abort', abort);
    reader.onload = () => {
      cleanup();
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    };
    reader.onerror = () => {
      cleanup();
      reject(reader.error ?? new Error(`Could not read ${file.name}.`));
    };
    reader.onabort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else reader.readAsArrayBuffer(file);
  });
}

/**
 * Loads the FFmpeg WASM binary (cached after first load)
 */
async function getFFmpeg(onLog?: (message: string) => void): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) {
    return ffmpeg;
  }

  const instance = new FFmpeg();
  ffmpeg = instance;

  if (onLog) {
    instance.on('log', ({ message }) => {
      onLog(message);
    });
  }

  // Load FFmpeg WASM from CDN with multi-threaded support
  // These downloads can be large (~31MB for the WASM binary) and flaky on mobile,
  // so we retry each fetch independently with exponential backoff.
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

  let coreURL: string | null = null;
  let wasmURL: string | null = null;
  try {
    coreURL = await withRetry(
      () => withAbortableTimeout(signal => fetchToBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript', signal), 20_000, 'Video encoder download timed out.'),
      { maxAttempts: 3, label: 'fetch FFmpeg core JS from CDN' },
    );
    wasmURL = await withRetry(
      () => withAbortableTimeout(signal => fetchToBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm', signal), 20_000, 'Video encoder download timed out.'),
      { maxAttempts: 3, label: 'fetch FFmpeg WASM binary from CDN' },
    );
  } catch {
    try { instance.terminate(); } catch { /* not loaded yet */ }
    if (ffmpeg === instance) ffmpeg = null;
    if (coreURL) URL.revokeObjectURL(coreURL);
    if (wasmURL) URL.revokeObjectURL(wasmURL);
    throw new Error('Could not download the video encoder. Please check your internet connection and try again.');
  }

  try {
    await withTimeout(
      instance.load({ coreURL, wasmURL }),
      30_000,
      'Loading the video encoder timed out. Please use a shorter video.',
      () => instance.terminate(),
    );
    return instance;
  } catch (error) {
    ffmpeg = null;
    throw error;
  } finally {
    URL.revokeObjectURL(coreURL);
    URL.revokeObjectURL(wasmURL);
  }
}

/**
 * Gets video resolution by loading it into a <video> element
 */
export function needsVideoTranscode(width: number, height: number): boolean {
  return width >= height ? width > 1280 || height > 720 : width > 720 || height > 1280;
}

export function needsCompatibilityTranscode(filename: string, container: VideoContainer): boolean {
  return !filename.toLowerCase().endsWith('.mp4') || container !== 'iso-video';
}

export function calculateVideoDimensions(width: number, height: number): { width: number; height: number } {
  const landscape = width >= height;
  const maxWidth = landscape ? 1280 : 720;
  const maxHeight = landscape ? 720 : 1280;
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  const even = (value: number) => {
    const rounded = Math.max(2, Math.round(value));
    return rounded % 2 === 0 ? rounded : rounded - 1;
  };
  return { width: even(width * scale), height: even(height * scale) };
}

export function getVideoResolution(file: File, timeoutMs = 10_000): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute?.('src');
      callback();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`Reading video metadata timed out for ${file.name}. Please use a shorter video.`)));
    }, timeoutMs);

    video.onloadedmetadata = () => {
      finish(() => resolve({ width: video.videoWidth, height: video.videoHeight }));
    };

    video.onerror = () => {
      finish(() => reject(new Error(`Could not read video metadata for ${file.name}. Please use a shorter video.`)));
    };

    video.src = objectUrl;
  });
}

export interface VideoConvertProgress {
  stage: 'loading' | 'analyzing' | 'converting' | 'done';
  message: string;
  /** 0-100 percentage, only available during 'converting' stage */
  percent?: number;
}

/**
 * Re-encodes a video to 720p (1280x720) using FFmpeg WASM.
 * If the video is already 720p or smaller, returns it as-is.
 *
 * @param file - The original video file
 * @param onProgress - Callback for progress updates
 * @returns The re-encoded video file (MP4) or the original if already small enough
 */
export async function reencodeVideoTo720p(
  file: File,
  onProgress?: (progress: VideoConvertProgress) => void,
): Promise<File> {
  const report = (p: VideoConvertProgress) => onProgress?.(p);

  // Check current resolution
  report({ stage: 'analyzing', message: `Analyzing ${file.name}...` });

  const container = await detectVideoContainer(file);
  if (container === 'unknown' || container === 'image-bmff') {
    throw new Error(`Could not recognise the video container for ${file.name}.`);
  }

  let resolution: { width: number; height: number };
  try {
    resolution = await getVideoResolution(file);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(`Could not read video metadata for ${file.name}. Please use a shorter video.`);
  }

  const { width, height } = resolution;
  console.log(`Video ${file.name}: ${width}x${height}`);

  const needsResize = needsVideoTranscode(width, height);
  const needsCompatibility = needsCompatibilityTranscode(file.name, container);

  // Browser-friendly MP4 footage inside the size bounds can be uploaded unchanged.
  // MOV/M4V/WebM/MKV files are converted even when small so other guests can play them.
  if (!needsResize && !needsCompatibility) {
    console.log(`Video ${file.name} is already a compatible MP4 within 720p bounds, skipping re-encode`);
    report({ stage: 'done', message: `${file.name} is ready to upload — no conversion needed` });
    return file;
  }

  const { width: targetWidth, height: targetHeight } = calculateVideoDimensions(width, height);

  report({ stage: 'loading', message: 'Loading video encoder...' });

  let lastPercent = 0;
  const instance = await getFFmpeg((message) => {
    // Parse FFmpeg progress output for time-based progress
    const timeMatch = message.match(/time=(\d+):(\d+):(\d+\.\d+)/);
    if (timeMatch) {
      // We don't know total duration easily from logs, so just show activity
      lastPercent = Math.min(lastPercent + 1, 95);
      report({
        stage: 'converting',
        message: `Re-encoding to ${targetWidth}x${targetHeight}...`,
        percent: lastPercent,
      });
    }
  });

  report({
    stage: 'converting',
    message: `Re-encoding ${file.name} from ${width}x${height} to ${targetWidth}x${targetHeight}...`,
    percent: 0,
  });

  const inputName = 'input' + getExtension(file.name);
  const outputName = 'output.mp4';

  let data;
  const stopEncoder = () => {
    instance.terminate();
    if (ffmpeg === instance) ffmpeg = null;
  };
  try {
    const inputData = await withAbortableTimeout(
      signal => readFileAbortably(file, signal),
      20_000,
      `Preparing ${file.name} timed out. Please use a shorter video.`,
      stopEncoder,
    );
    await withTimeout(
      instance.writeFile(inputName, inputData),
      20_000,
      `Preparing ${file.name} timed out. Please use a shorter video.`,
      stopEncoder,
    );
    await withTimeout(instance.exec([
      '-i', inputName,
      '-vf', `scale=${targetWidth}:${targetHeight}`,
      '-c:v', 'libx264',
      '-crf', '32',
      '-preset', 'ultrafast',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputName,
    ]), 120_000, `Processing ${file.name} timed out. Please use a shorter video.`, stopEncoder);
    data = await withTimeout(
      instance.readFile(outputName),
      15_000,
      `Finishing ${file.name} timed out. Please use a shorter video.`,
      stopEncoder,
    );
  } finally {
    const safeDelete = async (name: string) => {
      try {
        await withTimeout(Promise.resolve().then(() => instance.deleteFile(name)), 5_000, 'Video cleanup timed out.');
      } catch {
        // The worker may already have been terminated by a timeout.
      }
    };
    await safeDelete(inputName);
    await safeDelete(outputName);
  }

  // Create new File object (cast needed since FFmpeg returns Uint8Array with potentially shared buffer)
  const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
  const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
  const convertedFile = new File([blob], `${nameWithoutExt}.mp4`, {
    type: 'video/mp4',
    lastModified: Date.now(),
  });

  console.log(
    `✓ Re-encoded ${file.name}: ${width}x${height} → ${targetWidth}x${targetHeight}, ` +
    `${formatBytes(file.size)} → ${formatBytes(convertedFile.size)} ` +
    `(${Math.round((1 - convertedFile.size / file.size) * 100)}% smaller)`
  );

  report({ stage: 'done', message: `Re-encoded ${file.name} — ${Math.round((1 - convertedFile.size / file.size) * 100)}% smaller` });

  return convertedFile;
}

function getExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? `.${ext}` : '.mp4';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
