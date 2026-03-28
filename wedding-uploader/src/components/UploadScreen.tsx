import { useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { convertToJpeg, formatFileSize, generateThumbnail } from '../utils/imageConverter';
import { reencodeVideoTo720p } from '../utils/videoConverter';
import { logAction } from '../utils/actionLog';

// Add this new prop
interface UploadScreenProps {
  onShowGallery: () => void;
  uploaderName: string;
}

export function UploadScreen({ onShowGallery, uploaderName }: UploadScreenProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);

  // Helper function to sanitize filename to prevent path traversal attacks
  const sanitizeFilename = (filename: string): string => {
    // Remove any path traversal sequences and normalize the filename
    return filename
      .replace(/\.\./g, '') // Remove parent directory references
      .replace(/[\/\\]/g, '_') // Replace slashes with underscores
      .replace(/^[\/\\]+/, '') // Remove leading slashes
      .replace(/[\/\\]+$/, '') // Remove trailing slashes
      .trim() || 'file'; // Fallback to 'file' if empty after sanitization
  };

  // Helper function to sanitize user input to prevent XSS
  const sanitizeUserInput = (input: string): string => {
    // Remove potentially dangerous characters and limit length
    return input
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/[<>\"']/g, '') // Remove remaining dangerous characters
      .trim()
      .substring(0, 100); // Limit length to prevent DoS
  };

  // Helper function to check if a file is an image (including HEIC)
  const isImageFile = (file: File): boolean => {
    // Check MIME type
    if (file.type.startsWith('image/')) {
      return true;
    }
    // Check extension for HEIC files (browsers often don't set correct MIME type)
    const extension = file.name.toLowerCase().split('.').pop();
    return extension === 'heic' || extension === 'heif';
  };

  // Helper function to check if a file is a GIF (should not be converted)
  const isGifFile = (file: File): boolean => {
    const extension = file.name.toLowerCase().split('.').pop();
    return extension === 'gif' || file.type === 'image/gif';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(e.target.files);
    setSuccessMessage('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if Supabase is configured
    if (!isSupabaseConfigured()) {
      setError('Supabase is not configured. Please add your credentials to .env.local file and restart the server.');
      return;
    }

    if (!files || files.length === 0) {
      setError('Please select at least one file to upload.');
      return;
    }

    setIsUploading(true);
    setError('');
    setSuccessMessage('');

    logAction('upload_start', `${files.length} file(s) selected`);

    try {
      // Separate images, GIFs, and videos
      const fileArray = Array.from(files);
      const gifs = fileArray.filter(f => isGifFile(f));
      const images = fileArray.filter(f => isImageFile(f) && !isGifFile(f));
      const videos = fileArray.filter(f => f.type.startsWith('video/'));

      // Log file detection for debugging
      console.log('Files detected:', {
        total: fileArray.length,
        images: images.map(f => ({ name: f.name, type: f.type, size: f.size })),
        gifs: gifs.map(f => ({ name: f.name, type: f.type, size: f.size })),
        videos: videos.map(f => ({ name: f.name, type: f.type, size: f.size }))
      });

      // Validate video sizes (400MB = ~10 min of HD video)
      const MAX_VIDEO_SIZE = 400 * 1024 * 1024; // 400 MB
      const oversizedVideos = videos.filter(v => v.size > MAX_VIDEO_SIZE);

      if (oversizedVideos.length > 0) {
        const videoNames = oversizedVideos.map(v =>
          `${v.name} (${formatFileSize(v.size)})`
        ).join(', ');
        setError(
          `The following video(s) exceed the 400MB limit (≈10 minutes): ${videoNames}. Please use shorter videos or compress them before uploading.`
        );
        setIsUploading(false);
        return;
      }

      // Convert images to JPEG (0.8 quality)
      if (images.length > 0) {
        setSuccessMessage(`Converting ${images.length} image(s) to JPEG...`);
      }

      const convertedImages = await Promise.all(
        images.map(async (img) => {
          console.log(`Converting ${img.name}...`);
          const converted = await convertToJpeg(img, 0.8);

          // Check if file was actually converted or returned as-is
          if (converted.name !== img.name) {
            console.log(`✓ Converted ${img.name} to ${converted.name} (${formatFileSize(img.size)} → ${formatFileSize(converted.size)})`);
          } else {
            console.log(`→ Kept original: ${img.name} (conversion not needed or not supported)`);
          }

          return converted;
        })
      );

      // Re-encode videos to 720p to save storage space
      let convertedVideos: File[] = [];
      if (videos.length > 0) {
        setSuccessMessage(`Re-encoding ${videos.length} video(s) to 720p...`);
        convertedVideos = [];
        for (const video of videos) {
          try {
            const converted = await reencodeVideoTo720p(video, (progress) => {
              setSuccessMessage(progress.message);
            });
            if (converted !== video) {
              setSuccessMessage(`Re-encoded ${video.name}: ${formatFileSize(video.size)} → ${formatFileSize(converted.size)}`);
            }
            convertedVideos.push(converted);
          } catch (err: any) {
            console.warn(`Video re-encoding failed for ${video.name}:`, err);
            throw new Error(`Could not process ${video.name}. Please try again or use a shorter video.`);
          }
        }
      }

      // Combine converted images with original GIFs and re-encoded videos
      const filesToUpload = [...convertedImages, ...gifs, ...convertedVideos];

      setSuccessMessage(`Uploading ${filesToUpload.length} file(s)...`);

      // Upload all files (with thumbnails for images)
      const uploadPromises = filesToUpload.map(async (file) => {
        // Sanitize filename to prevent path traversal attacks
        const sanitizedName = sanitizeFilename(file.name);
        // Create a unique file path
        const uniquePrefix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const filePath = `public/${uniquePrefix}-${sanitizedName}`;

        // 1. Upload to Supabase Storage (with retry for transient network failures)
        let uploadError: Error | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const result = await supabase.storage
            .from('guest-media')
            .upload(filePath, file);

          if (!result.error) {
            uploadError = null;
            break;
          }

          uploadError = result.error;
          console.warn(`Upload attempt ${attempt + 1} failed for ${file.name} (${formatFileSize(file.size)}):`, result.error.message);

          if (attempt < 2) {
            // Wait before retrying (1s, then 3s)
            await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
          }
        }

        if (uploadError) {
          throw new Error(`Upload failed for ${file.name} (${formatFileSize(file.size)}): ${uploadError.message}`);
        }

        // 1b. Generate and upload thumbnail for images (not videos/GIFs)
        const isImage = file.type.startsWith('image/') && !isGifFile(file);
        let thumbnailPath: string | null = null;

        if (isImage) {
          const thumb = await generateThumbnail(file);
          if (thumb) {
            thumbnailPath = `public/${uniquePrefix}-${sanitizeFilename(thumb.name)}`;
            const { error: thumbError } = await supabase.storage
              .from('guest-media')
              .upload(thumbnailPath, thumb);

            if (thumbError) {
              console.warn(`Thumbnail upload failed for ${file.name}:`, thumbError);
              thumbnailPath = null;
            }
          }
        }

        // 2. Get the public URL
        const { data: urlData } = supabase.storage
          .from('guest-media')
          .getPublicUrl(filePath);

        if (!urlData) {
          throw new Error('Could not get file URL.');
        }

        // 3. Log the file in our 'uploads' database table
        // Use sanitized names for database to prevent XSS
        const { error: dbError } = await supabase
          .from('uploads')
          .insert({
            file_name: sanitizedName,
            file_url: urlData.publicUrl,
            file_path: filePath,
            thumbnail_path: thumbnailPath,
            uploader_name: sanitizeUserInput(uploaderName),
          });

        if (dbError) {
          throw new Error(`Database logging failed: ${dbError.message}`);
        }

        return file.name;
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      logAction('upload_success', `${uploadedFiles.length} file(s) uploaded`);
      setSuccessMessage(
        `Successfully uploaded ${uploadedFiles.length} file(s)! Sláinte!`
      );
      setFiles(null);
      // Reset the file input visually
      (document.getElementById('file-upload') as HTMLInputElement).value = '';
    } catch (err: any) {
      logAction('upload_error', err.message);
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
    <div className="w-full max-w-md p-8 space-y-6 rounded-2xl bg-card animate-scale-in">
      <div className="text-center stagger-1">
        <h1 className="text-5xl text-text-dark font-display flourish">
          Share the Craic
        </h1>
        <p className="mt-6 text-lg text-gold font-celtic text-2xl">
          Welcome, {uploaderName}!
        </p>
        <p className="mt-1 text-text-light italic text-sm">
          Upload your best moments from the stag do! ☘️
        </p>
      </div>

      <div className="section-divider" />

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="stagger-2">
          <label
            htmlFor="file-upload"
            className="flex flex-col items-center justify-center w-full p-6 border-2 border-dashed border-primary/35 rounded-xl bg-background/40 hover:bg-background/60 hover:border-primary/55 transition-all duration-300 cursor-pointer"
          >
            <svg className="w-8 h-8 text-primary/60 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-sm text-text-light">Tap to select photos & videos</span>
            {files && files.length > 0 && (
              <span className="mt-2 px-3 py-1 text-xs font-medium text-white bg-primary/80 rounded-full">
                {files.length} file{files.length > 1 ? 's' : ''} selected
              </span>
            )}
            <input
              id="file-upload"
              name="file-upload"
              type="file"
              multiple
              onChange={handleFileChange}
              accept="image/*,video/*,.heic,.heif"
              className="hidden"
            />
          </label>
          <p className="mt-2 text-xs text-text-light/60 text-center">
            Images converted to JPEG, videos re-encoded to 720p for faster uploads.
            <br />
            Videos can take a while to process - longer videos may need a few minutes, so please be patient!
          </p>
        </div>

        {error && <p className="text-sm text-red-400 text-center">{error}</p>}
        {successMessage && (
          <p className="text-sm text-gold italic text-center">{successMessage}</p>
        )}

        <div className="stagger-3">
          <button
            type="submit"
            disabled={isUploading || !files || files.length === 0}
            className="w-full py-3.5 px-6 font-bold text-white rounded-full btn-luxe tracking-wide"
          >
            {isUploading ? 'Uploading...' : 'Upload Files'}
          </button>
        </div>
      </form>

    </div>

      {createPortal(
        <div className="fixed right-6 bottom-6 sm:right-8 sm:bottom-8 z-[90]">
          <button
            onClick={onShowGallery}
            className="p-4 text-white rounded-full btn-luxe animate-pulse-soft hover:scale-110 transition-transform duration-300 touch-manipulation"
            title="View Gallery"
            style={{ touchAction: 'manipulation' }}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
