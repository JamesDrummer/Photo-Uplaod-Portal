import { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { convertToJpeg, formatFileSize } from '../utils/imageConverter';

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
      
      // Validate video sizes (200MB = ~5 min of HD video)
      const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200 MB
      const oversizedVideos = videos.filter(v => v.size > MAX_VIDEO_SIZE);
      
      if (oversizedVideos.length > 0) {
        const videoNames = oversizedVideos.map(v => 
          `${v.name} (${formatFileSize(v.size)})`
        ).join(', ');
        setError(
          `The following video(s) exceed the 200MB limit (≈5 minutes): ${videoNames}. Please use shorter videos or compress them before uploading.`
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

      // Combine converted images with original GIFs and videos (GIFs keep their animation)
      const filesToUpload = [...convertedImages, ...gifs, ...videos];
      
      setSuccessMessage(`Uploading ${filesToUpload.length} file(s)...`);

      // Upload all files
      const uploadPromises = filesToUpload.map(async (file) => {
        // Sanitize filename to prevent path traversal attacks
        const sanitizedName = sanitizeFilename(file.name);
        // Create a unique file path
        const filePath = `public/${Date.now()}-${Math.random().toString(36).substring(7)}-${sanitizedName}`;

        // 1. Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('guest-media') // Our bucket name
          .upload(filePath, file);

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
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
            uploader_name: sanitizeUserInput(uploaderName),
          });
        
        if (dbError) {
          throw new Error(`Database logging failed: ${dbError.message}`);
        }

        return file.name;
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      setSuccessMessage(
        `Successfully uploaded ${uploadedFiles.length} file(s)! Thank you!`
      );
      setFiles(null);
      // Reset the file input visually
      (document.getElementById('file-upload') as HTMLInputElement).value = '';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 space-y-6 rounded-lg shadow-lg bg-card">
      <div className="text-center">
        <h1 className="text-5xl text-text-dark font-display">
          Share Your Moments
        </h1>
        <p className="mt-2 text-lg text-red-600">
          Welcome, {uploaderName}!
        </p>
        <p className="mt-2 text-text-light">
          Share your favorite moments from the holidays!
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label
            htmlFor="file-upload"
            className="block mb-2 text-sm font-medium text-text-light"
          >
            Select Photos & Videos
          </label>
          <input
            id="file-upload"
            name="file-upload"
            type="file"
            multiple
            onChange={handleFileChange}
            accept="image/*,video/*,.heic,.heif"
            className="block w-full text-sm rounded-lg cursor-pointer text-text-light file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-red-800"
          />
          <p className="mt-1 text-xs text-gray-400">
            You can select multiple files at once. Images will be automatically converted to JPEG for faster uploads.
          </p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {successMessage && (
          <p className="text-sm text-green-400">{successMessage}</p>
        )}

        <button
          type="submit"
          disabled={isUploading}
          className="w-full p-3 font-bold text-white transition-colors rounded-md bg-primary hover:bg-red-800 disabled:bg-gray-500 disabled:cursor-not-allowed"
        >
          {isUploading ? 'Uploading...' : 'Upload Files'}
        </button>
      </form>

      {/* Floating Gallery Button */}
      <button
        onClick={onShowGallery}
        className="fixed p-4 text-white transition-all duration-300 rounded-full shadow-lg bottom-8 right-8 bg-primary hover:bg-red-800 hover:scale-110 touch-manipulation z-40"
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
    </div>
  );
}

