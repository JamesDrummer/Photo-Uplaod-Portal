import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Upload, getFullUrl, isVideoFile } from './GalleryItem';

interface LightboxProps {
  uploads: Upload[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

/** Resolve the display URL for a given upload in the lightbox. */
function getLightboxUrl(upload: Upload) {
  return getFullUrl(upload.file_path);
}

export function Lightbox({ uploads, currentIndex, onClose, onNavigate }: LightboxProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isBuffering, setIsBuffering] = useState(true);
  const [bufferedPercent, setBufferedPercent] = useState(0);

  const upload = uploads[currentIndex];
  const isVideo = isVideoFile(upload.file_name);
  const url = getLightboxUrl(upload);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < uploads.length - 1;

  // Prefetch adjacent images so they load instantly when navigated to
  useEffect(() => {
    const toPrefetch: string[] = [];
    if (currentIndex > 0) {
      const prev = uploads[currentIndex - 1];
      if (!isVideoFile(prev.file_name)) toPrefetch.push(getLightboxUrl(prev));
    }
    if (currentIndex < uploads.length - 1) {
      const next = uploads[currentIndex + 1];
      if (!isVideoFile(next.file_name)) toPrefetch.push(getLightboxUrl(next));
    }

    const prefetchImages = toPrefetch.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });

    return () => {
      // Cancel any pending loads
      prefetchImages.forEach((img) => { img.src = ''; });
    };
  }, [currentIndex, uploads]);

  // Close on Escape, navigate with arrow keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate(currentIndex - 1);
      if (e.key === 'ArrowRight' && hasNext) onNavigate(currentIndex + 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNavigate, currentIndex, hasPrev, hasNext]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  // Reset buffering state when switching to a new video
  useEffect(() => {
    if (isVideo) {
      setIsBuffering(true);
      setBufferedPercent(0);
    }
  }, [url, isVideo]);

  // Handle video buffering events
  useEffect(() => {
    if (!isVideo || !videoRef.current) return;

    const video = videoRef.current;

    const handleCanPlay = () => setIsBuffering(false);
    const handleWaiting = () => setIsBuffering(true);
    const handleProgress = () => {
      if (video.buffered.length > 0 && video.duration > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        setBufferedPercent((bufferedEnd / video.duration) * 100);
      }
    };
    const handleCanPlayThrough = () => setIsBuffering(false);

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('canplaythrough', handleCanPlayThrough);

    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('canplaythrough', handleCanPlayThrough);
    };
  }, [isVideo, url]);

  const navButtonClass =
    'absolute top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white hover:bg-white/20 transition-all duration-200 touch-manipulation';

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md lightbox-backdrop"
      onClick={onClose}
      onTouchStart={(e) => {
        const startY = e.touches[0].clientY;
        const startX = e.touches[0].clientX;
        const handleTouchEnd = (endEvent: TouchEvent) => {
          const endY = endEvent.changedTouches[0].clientY;
          const endX = endEvent.changedTouches[0].clientX;
          const deltaX = endX - startX;
          const deltaY = endY - startY;

          // Swipe down to close
          if (deltaY > 150 && Math.abs(deltaX) < 100) {
            onClose();
          }
          // Swipe left/right to navigate
          if (Math.abs(deltaX) > 80 && Math.abs(deltaY) < 100) {
            if (deltaX < 0 && hasNext) onNavigate(currentIndex + 1);
            if (deltaX > 0 && hasPrev) onNavigate(currentIndex - 1);
          }

          document.removeEventListener('touchend', handleTouchEnd);
        };
        document.addEventListener('touchend', handleTouchEnd);
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white hover:bg-white/20 transition-all duration-200 touch-manipulation"
        aria-label="Close"
        style={{ touchAction: 'manipulation' }}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Previous button */}
      {hasPrev && (
        <button
          className={`${navButtonClass} left-3`}
          onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex - 1); }}
          aria-label="Previous"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Next button */}
      {hasNext && (
        <button
          className={`${navButtonClass} right-3`}
          onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex + 1); }}
          aria-label="Next"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      <div
        className="relative flex flex-col items-center max-w-[95vw] max-h-[95vh] p-4 lightbox-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center max-w-full max-h-[85vh]">
          {isVideo ? (
            <div className="relative max-w-full max-h-[85vh]">
              <video
                key={url}
                ref={videoRef}
                src={url}
                controls
                autoPlay
                preload="auto"
                playsInline
                className="max-w-full max-h-[85vh] rounded-xl shadow-2xl ring-1 ring-white/10"
                style={{ maxHeight: 'calc(100vh - 120px)' }}
              >
                Your browser does not support the video tag.
              </video>
              {isBuffering && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-50 rounded-xl">
                  <div className="luxe-spinner mb-4"></div>
                  <p className="text-white text-sm italic">
                    {bufferedPercent > 0 ? `Buffering... ${Math.round(bufferedPercent)}%` : 'Loading video...'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <img
              key={url}
              src={url}
              alt={upload.file_name}
              decoding="async"
              className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain ring-1 ring-white/10"
              onError={(e) => {
                console.error('Failed to load image:', url);

                const currentSrc = e.currentTarget.src;
                const fallbackImg = new Image();
                fallbackImg.onload = () => {
                  e.currentTarget.src = fallbackImg.src;
                  e.currentTarget.style.display = 'block';
                };
                fallbackImg.onerror = () => {
                  e.currentTarget.style.display = 'none';
                  const fallbackDiv = document.createElement('div');
                  fallbackDiv.className = 'max-w-full max-h-[85vh] rounded-lg shadow-2xl bg-gray-800 flex items-center justify-center p-8';

                  const container = document.createElement('div');
                  container.className = 'text-center text-white';

                  const title = document.createElement('p');
                  title.className = 'text-lg mb-2';
                  title.textContent = 'Image could not be displayed';

                  const filenamePara = document.createElement('p');
                  filenamePara.className = 'text-sm text-gray-400';
                  filenamePara.textContent = upload.file_name;

                  const hint = document.createElement('p');
                  hint.className = 'text-xs text-gray-500 mt-2';
                  hint.textContent = 'HEIC format may not be supported';

                  container.appendChild(title);
                  container.appendChild(filenamePara);
                  container.appendChild(hint);
                  fallbackDiv.appendChild(container);
                  e.currentTarget.parentNode?.appendChild(fallbackDiv);
                };

                const thumbnailUrl = currentSrc.replace('/render/image/', '/render/image/').replace('600', '300');
                fallbackImg.src = thumbnailUrl;
              }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
