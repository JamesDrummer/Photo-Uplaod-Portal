import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { logAction } from '../utils/actionLog';
import { withRetry } from '../utils/retry';

export type Upload = {
  id: number;
  file_path: string;
  file_name: string;
  thumbnail_path?: string | null;
};

interface GalleryItemProps {
  upload: Upload;
  index: number;
  onFileMissing?: (uploadId: number) => void;
  onOpenLightbox?: () => void;
}

/** Get the full (untransformed) public URL for a file. */
export function getFullUrl(filePath: string) {
  const { data } = supabase.storage
    .from('guest-media')
    .getPublicUrl(filePath);
  return data?.publicUrl || '';
}

/** Generate a Supabase transform URL (used only as fallback for legacy uploads without thumbnails). */
function getLegacyTransformUrl(filePath: string, width: number, height: number) {
  const { data } = supabase.storage
    .from('guest-media')
    .getPublicUrl(filePath, {
      transform: { width, height, resize: 'cover', format: 'origin' },
    });
  return data?.publicUrl || '';
}

/** Detect file type helpers */
export const isVideoFile = (name: string) => /\.(mp4|mov|mkv|webm)$/i.test(name);
export const isGifFile = (name: string) => /\.gif$/i.test(name);

export function GalleryItem({ upload, index, onFileMissing, onOpenLightbox }: GalleryItemProps) {
  const [hasError, setHasError] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isMediaLoaded, setIsMediaLoaded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver — only load media when item is near the viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // start loading 200px before visible
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Safety check
  if (!upload.file_path || hasError) {
    if (!upload.file_path) {
      console.warn('Upload missing file_path:', upload);
    }
    return null;
  }

  const isVideo = isVideoFile(upload.file_name);
  const isGif = isGifFile(upload.file_name);

  const fullUrl = getFullUrl(upload.file_path);

  // For images, use pre-generated thumbnail if available.
  // Legacy uploads without a thumbnail fall back to Supabase transform.
  // GIFs use original to preserve animation.
  const thumbnailUrl = useMemo(() => {
    if (isVideo || isGif) return fullUrl;
    if (upload.thumbnail_path) return getFullUrl(upload.thumbnail_path);
    return getLegacyTransformUrl(upload.file_path, 300, 300);
  }, [upload.file_path, upload.thumbnail_path, fullUrl, isGif, isVideo]);

  const displayImageUrl = imageSrc ?? thumbnailUrl;

  return (
    <div
      ref={containerRef}
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
          onOpenLightbox?.();
        }}
        className="absolute inset-0 w-full h-full touch-manipulation"
        style={{ touchAction: 'manipulation' }}
      >
        {isVisible && isVideo ? (
          <>
            <video
              src={fullUrl}
              className={`absolute inset-0 object-cover w-full h-full transition-opacity duration-300 ${
                isMediaLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              muted
              playsInline
              preload="metadata"
              poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23374151'/%3E%3Cstop offset='100%25' style='stop-color:%231f2937'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23g)' width='300' height='300'/%3E%3C/svg%3E"
              onLoadedMetadata={(e) => {
                e.currentTarget.currentTime = 0.1;
              }}
              onLoadedData={() => setIsMediaLoaded(true)}
              onError={async () => {
                console.error('Failed to load video:', fullUrl, upload);
                setHasError(true);
                if (onFileMissing) {
                  onFileMissing(upload.id);
                }
                try {
                  await withRetry(async () => {
                    const { error } = await supabase.from('uploads').delete().eq('id', upload.id);
                    if (error) throw error;
                  }, { maxAttempts: 2, label: `delete orphaned video record ${upload.id}`, silent: true });
                  console.log('Deleted orphaned record:', upload.id);
                } catch (deleteError) {
                  console.error('Failed to delete orphaned record:', deleteError);
                }
              }}
            />
            {/* Play button overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 pointer-events-none">
              <svg
                className="w-16 h-16 text-white drop-shadow-lg"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </>
        ) : isVisible ? (
          <>
            <img
              src={displayImageUrl}
              alt={upload.file_name}
              loading="lazy"
              decoding="async"
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
                if (onFileMissing) {
                  onFileMissing(upload.id);
                }
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
        ) : null}
      </button>
    </div>
  );
}
