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

/**
 * Converts an image file to JPEG format with specified quality
 * @param file - The original image file
 * @param quality - JPEG quality (0-1), default 0.8
 * @returns Promise<File> - The converted JPEG file or original file if conversion fails
 */
export async function convertToJpeg(
  file: File,
  quality: number = 0.8
): Promise<File> {
  // Handle HEIC files specially
  if (isHeicFile(file)) {
    try {
      console.log(`Attempting HEIC conversion for ${file.name}...`);
      // Convert HEIC to JPEG using heic2any
      const convertedBlob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: quality,
      });

      // heic2any can return an array of blobs for multi-page images
      const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;

      // Create new File object with .jpg extension
      const originalName = file.name;
      const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
      const newFileName = `${nameWithoutExt}.jpg`;

      const convertedFile = new File([blob], newFileName, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
      
      console.log(`✓ Successfully converted HEIC: ${file.name} → ${convertedFile.name}`);
      return convertedFile;
    } catch (error) {
      // HEIC conversion failed - this is common with newer iPhone formats
      // Return original file and let Supabase handle it
      console.warn(`⚠️ HEIC conversion failed for ${file.name}, uploading original file. Error:`, error);
      return file;
    }
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

