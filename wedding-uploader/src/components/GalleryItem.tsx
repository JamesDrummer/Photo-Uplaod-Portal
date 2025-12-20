import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Lightbox } from './Lightbox';

export type Upload = {
  id: number;
  file_path: string;
  file_name: string;
};

interface GalleryItemProps {
  upload: Upload;
  onFileMissing?: (uploadId: number) => void;
}

export function GalleryItem({ upload, onFileMissing }: GalleryItemProps) {
  const [showLightbox, setShowLightbox] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Safety check
  if (!upload.file_path || hasError) {
    if (!upload.file_path) {
      console.warn('Upload missing file_path:', upload);
    }
    return null;
  }

  // Check if the file is a video
  const isVideo = upload.file_name.match(/\.(mp4|mov|mkv|webm)$/i);
  
  // Check if the file is HEIC (which browsers can't display directly)
  const isHeic = upload.file_name.match(/\.heic$/i);

  // Generate the full-size URL
  const { data: fullData } = supabase.storage
    .from('guest-media')
    .getPublicUrl(upload.file_path);

  const fullUrl = fullData?.publicUrl || '';

  // For images, generate a thumbnail. For videos, use the video itself
  const getThumbnailUrl = () => {
    if (isVideo) {
      return fullUrl; // Return the video URL directly
    } else {
      // Use Supabase image transformation for photo thumbnails
      const { data: thumbData } = supabase.storage
        .from('guest-media')
        .getPublicUrl(upload.file_path, {
          transform: {
            width: 300,
            height: 300,
            resize: 'cover',
          },
        });
      return thumbData?.publicUrl || fullUrl;
    }
  };

  const thumbnailUrl = getThumbnailUrl();

  // Get lightbox URL - use working thumbnail approach for HEIC files
  const getLightboxUrl = () => {
    if (isHeic) {
      console.log('HEIC file detected:', upload.file_name);
      
      // Use the same transformation as thumbnails but larger
      // Supabase will cache this transformation
      const { data: lightboxData } = supabase.storage
        .from('guest-media')
        .getPublicUrl(upload.file_path, {
          transform: {
            width: 600,
            height: 600,
            resize: 'cover', // Use 'cover' like the working thumbnails
          },
        });
      
      console.log('Using transformed URL for lightbox:', lightboxData?.publicUrl);
      
      // Use the transformed URL (Supabase caches these)
      return lightboxData?.publicUrl || fullUrl;
    }
    console.log('Regular file URL:', fullUrl);
    return fullUrl;
  };

  return (
    <>
      <div className="relative w-full overflow-hidden transition-transform duration-300 rounded-lg shadow-lg cursor-pointer aspect-square hover:scale-105 touch-manipulation">
        <button
          onClick={() => setShowLightbox(true)}
          className="absolute inset-0 w-full h-full touch-manipulation"
          style={{ touchAction: 'manipulation' }}
        >
          {isVideo ? (
            <>
              <video
                src={thumbnailUrl}
                className="absolute inset-0 object-cover w-full h-full"
                muted
                playsInline
                onError={async () => {
                  console.error('Failed to load video:', thumbnailUrl, upload);
                  setHasError(true);
                  // Notify parent that this file is missing
                  if (onFileMissing) {
                    onFileMissing(upload.id);
                  }
                  // Optionally delete the orphaned database record
                  try {
                    await supabase.from('uploads').delete().eq('id', upload.id);
                    console.log('Deleted orphaned record:', upload.id);
                  } catch (deleteError) {
                    console.error('Failed to delete orphaned record:', deleteError);
                  }
                }}
              />
              {/* Play button overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
                <svg
                  className="w-16 h-16 text-white drop-shadow-lg"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </>
          ) : (
            <img
              src={thumbnailUrl}
              alt={upload.file_name}
              className="absolute inset-0 object-cover w-full h-full"
              onError={async () => {
                console.error('Failed to load thumbnail:', thumbnailUrl, upload);
                setHasError(true);
                // Notify parent that this file is missing
                if (onFileMissing) {
                  onFileMissing(upload.id);
                }
                // Optionally delete the orphaned database record
                try {
                  await supabase.from('uploads').delete().eq('id', upload.id);
                  console.log('Deleted orphaned record:', upload.id);
                } catch (deleteError) {
                  console.error('Failed to delete orphaned record:', deleteError);
                }
              }}
            />
          )}
        </button>
      </div>

      {showLightbox && (
        <Lightbox
          url={getLightboxUrl()}
          filename={upload.file_name}
          isVideo={!!isVideo}
          onClose={() => setShowLightbox(false)}
        />
      )}
    </>
  );
}
