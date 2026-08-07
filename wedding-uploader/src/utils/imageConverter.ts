import heic2any from 'heic2any';

/**
 * Checks if a file is HEIC/HEIF format
 * @param file - The file to check
 * @returns boolean - True if the file is HEIC/HEIF
 */
function isHeicFile(file: File): boolean {
  const extension = file.name.toLowerCase().split('.').pop();
  return (
    extension === 'heic' || 
    extension === 'heif' || 
    file.type === 'image/heic' || 
    file.type === 'image/heif'
  );
}

type HeicConverter = (options: Parameters<typeof heic2any>[0]) => ReturnType<typeof heic2any>;

export async function convertHeicToJpeg(
  file: File,
  quality: number = 0.8,
  converter: HeicConverter = heic2any,
): Promise<File> {
  try {
    const convertedBlob = await converter({ blob: file, toType: 'image/jpeg', quality });
    const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    return new File([blob], `${nameWithoutExt}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn(`HEIC conversion failed for ${file.name}:`, error);
    throw new Error(`Could not convert ${file.name}. Please choose a different photo or export it as JPEG.`);
  }
}

/**
 * Converts an image file to JPEG format with specified quality
 * @param file - The original image file
 * @param quality - JPEG quality (0-1), default 0.8
 * @returns Promise<File> - The converted JPEG file
 * @throws If HEIC or browser image conversion fails
 */
export async function convertToJpeg(
  file: File,
  quality: number = 0.8
): Promise<File> {
  // HEIC must be converted successfully; uploading the original would create a gallery item many browsers cannot render.
  if (isHeicFile(file)) {
    return convertHeicToJpeg(file, quality);
  }

  // For non-HEIC images, use Canvas API
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        // Create canvas with image dimensions
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw image on canvas
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0);

        // Convert to JPEG blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to convert image to JPEG'));
              return;
            }

            // Create new File object with .jpg extension
            const originalName = file.name;
            const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
            const newFileName = `${nameWithoutExt}.jpg`;

            const convertedFile = new File([blob], newFileName, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });

            resolve(convertedFile);
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${file.name}`));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error(`Failed to read file: ${file.name}`));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Generates a thumbnail (JPEG) for an image file using the Canvas API.
 * @param file - The image file (should already be JPEG/PNG/WebP, not HEIC)
 * @param maxSize - Maximum width/height in pixels (default 300)
 * @param quality - JPEG quality 0-1 (default 0.7)
 * @returns The thumbnail as a File, or null if generation fails
 */
export async function generateThumbnail(
  file: File,
  maxSize: number = 300,
  quality: number = 0.7
): Promise<File | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        // Calculate scaled dimensions maintaining aspect ratio
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height / width) * maxSize);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width / height) * maxSize);
            height = maxSize;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(null);
              return;
            }

            const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
            const thumbFile = new File([blob], `${nameWithoutExt}_thumb.jpg`, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });

            resolve(thumbFile);
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => resolve(null);
      img.src = e.target?.result as string;
    };

    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * Formats file size in human-readable format
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "2.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

