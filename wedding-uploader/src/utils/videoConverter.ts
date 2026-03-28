import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

/**
 * Loads the FFmpeg WASM binary (cached after first load)
 */
async function getFFmpeg(onLog?: (message: string) => void): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) {
    return ffmpeg;
  }

  ffmpeg = new FFmpeg();

  if (onLog) {
    ffmpeg.on('log', ({ message }) => {
      onLog(message);
    });
  }

  // Load FFmpeg WASM from CDN with multi-threaded support
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return ffmpeg;
}

/**
 * Gets video resolution by loading it into a <video> element
 */
function getVideoResolution(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve({ width: video.videoWidth, height: video.videoHeight });
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error(`Could not read video metadata for ${file.name}`));
    };

    video.src = URL.createObjectURL(file);
  });
}

export interface VideoConvertProgress {
  stage: 'loading' | 'analyzing' | 'converting' | 'done' | 'skipped';
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
 * @param signal - AbortSignal to cancel the re-encoding and upload original instead
 * @returns The re-encoded video file (MP4) or the original if already small enough / skipped
 */
export async function reencodeVideoTo720p(
  file: File,
  onProgress?: (progress: VideoConvertProgress) => void,
  signal?: AbortSignal,
): Promise<File> {
  const report = (p: VideoConvertProgress) => onProgress?.(p);

  // Check current resolution
  report({ stage: 'analyzing', message: `Analyzing ${file.name}...` });

  let resolution: { width: number; height: number };
  try {
    resolution = await getVideoResolution(file);
  } catch {
    // Can't read metadata — upload original
    console.warn(`Could not read video metadata for ${file.name}, uploading original`);
    return file;
  }

  const { width, height } = resolution;
  console.log(`Video ${file.name}: ${width}x${height}`);

  // Skip re-encoding if already 720p or smaller
  const maxDimension = Math.max(width, height);
  if (maxDimension <= 720) {
    console.log(`Video ${file.name} is already ≤720p, skipping re-encode`);
    report({ stage: 'done', message: `${file.name} is already ≤720p — no conversion needed` });
    return file;
  }

  // Check if already cancelled before starting heavy work
  if (signal?.aborted) {
    report({ stage: 'skipped', message: `Skipped re-encoding ${file.name}` });
    return file;
  }

  // Calculate target dimensions maintaining aspect ratio
  // Scale so the larger dimension becomes 720
  let targetWidth: number;
  let targetHeight: number;

  if (width >= height) {
    // Landscape or square
    targetWidth = 1280;
    targetHeight = Math.round((height / width) * 1280);
  } else {
    // Portrait
    targetHeight = 1280;
    targetWidth = Math.round((width / height) * 1280);
  }

  // FFmpeg requires even dimensions
  targetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth + 1;
  targetHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight + 1;

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

  // Write input file to FFmpeg virtual filesystem
  await instance.writeFile(inputName, await fetchFile(file));

  // Listen for abort signal to terminate FFmpeg
  const onAbort = () => { instance.terminate(); };
  signal?.addEventListener('abort', onAbort, { once: true });

  let aborted = false;
  try {
    // Re-encode to 720p H.264
    // -crf 32: Prioritises speed/smaller size (slightly lower quality, much faster)
    // -preset ultrafast: Fastest possible encoding (critical for browser WASM)
    // -vf scale: Resize to target dimensions
    // -movflags +faststart: Optimize for web streaming
    await instance.exec([
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
    ]);
  } catch {
    aborted = true;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }

  // If aborted, FFmpeg instance is terminated — need to reload next time
  if (aborted || signal?.aborted) {
    ffmpeg = null;
    console.log(`Re-encoding cancelled for ${file.name}, uploading original`);
    report({ stage: 'skipped', message: `Skipped re-encoding ${file.name} — uploading original` });
    return file;
  }

  // Read the output file
  const data = await instance.readFile(outputName);

  // Clean up virtual filesystem
  await instance.deleteFile(inputName);
  await instance.deleteFile(outputName);

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
