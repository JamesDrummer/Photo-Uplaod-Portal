import { useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Lightbox } from './Lightbox';
import { logAction } from '../utils/actionLog';

export type Upload = {
  id: number;
  file_path: string;
  file_name: string;
};

interface GalleryItemProps {
  upload: Upload;
  index: number;
  onFileMissing?: (uploadId: number) => void;
}

export function GalleryItem({ upload, index, onFileMissing }: GalleryItemProps) {
  const [showLightbox, setShowLightbox] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isMediaLoaded, setIsMediaLoaded] = useState(false);

  // Safety check
  if (!upload.file_path || hasError) {
    if (!upload.file_path) {
      console.warn('Upload missing file_path:', upload);
    }
    return null;
  }

  // Check if the file is a video
  const isVideo = upload.file_name.match(/\.(mp4|mov|mkv|webm)$/i);

  // Check if the file is a GIF (needs special handling to preserve animation)
  const isGif = upload.file_name.match(/\.gif$/i);

  // Check if the file is HEIC (which browsers can't display directly)
  const isHeic = upload.file_name.match(/\.heic$/i);

  // Generate the full-size URL
  const { data: fullData } = supabase.storage
    .from('guest-media')
    .getPublicUrl(upload.file_path);

  const fullUrl = fullData?.publicUrl || '';

  // For images, generate a thumbnail. For videos/GIFs, use the file itself
  const getThumbnailUrl = () => {
    if (isVideo) {
      return fullUrl; // Return the video URL directly
    } else if (isGif) {
      // GIFs should use the original URL to preserve animation
      return fullUrl;
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

  const thumbnailUrl = useMemo(() => getThumbnailUrl(), [upload.file_path, upload.file_name, fullUrl, isGif, isVideo]);
  const displayImageUrl = imageSrc ?? thumbnailUrl;

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
      <div
        className="relative w-full overflow-hidden transition-all duration-300 rounded-xl shadow-md cursor-pointer aspect-square hover:scale-[1.03] hover:shadow-lg hover:shadow-primary/20 touch-manipulation border border-primary/15 gallery-item-enter"
        style={{ animationDelay: `${Math.min(index * 0.05, 0.5)}s` }}
      >
        {!isMediaLoaded && (
          <div
            aria-hidden="true"
            className="absolute inset-0 z-10 skeleton"
          />
        )}
        <button
          onClick={() => {
            logAction('lightbox_open', upload.file_name);
            setShowLightbox(true);
          }}
          className="absolute inset-0 w-full h-full touch-manipulation"
          style={{ touchAction: 'manipulation' }}
        >
          {isVideo ? (
            <>
              <video
                src={thumbnailUrl}
                className={`absolute inset-0 object-cover w-full h-full transition-opacity duration-300 ${
                  isMediaLoaded ? 'opacity-100' : 'opacity-0'
                }`}
                muted
                playsInline
                preload="metadata"
                poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23374151'/%3E%3Cstop offset='100%25' style='stop-color:%231f2937'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23g)' width='300' height='300'/%3E%3C/svg%3E"
                onLoadedMetadata={(e) => {
                  // Seek slightly into the video to trigger frame rendering on mobile
                  e.currentTarget.currentTime = 0.1;
                }}
                onLoadedData={() => setIsMediaLoaded(true)}
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
            <>
              <img
                src={displayImageUrl}
                alt={upload.file_name}
                className={`absolute inset-0 object-cover w-full h-full transition-opacity duration-300 ${
                  isMediaLoaded ? 'opacity-100' : 'opacity-0'
                }`}
                onLoad={() => setIsMediaLoaded(true)}
                onError={async () => {
                  if (displayImageUrl !== fullUrl) {
                    console.warn('Thumbnail failed, retrying with original image:', displayImageUrl, upload);
                    setIsMediaLoaded(false);
                    setImageSrc(fullUrl);
                    return;
                  }

                  console.error('Failed to load image:', displayImageUrl, upload);
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
              {/* Hover overlay - Irish green gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-primary/25 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300" />
            </>
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
