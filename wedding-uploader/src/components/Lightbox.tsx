import { useEffect, useRef, useState } from 'react';

interface LightboxProps {
  url: string;
  filename: string;
  isVideo: boolean;
  onClose: () => void;
}

export function Lightbox({ url, filename, isVideo, onClose }: LightboxProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isBuffering, setIsBuffering] = useState(true);
  const [bufferedPercent, setBufferedPercent] = useState(0);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Handle video buffering events
  useEffect(() => {
    if (!isVideo || !videoRef.current) return;

    const video = videoRef.current;

    const handleCanPlay = () => {
      // Enough data buffered to start playing
      setIsBuffering(false);
    };

    const handleWaiting = () => {
      // Video is waiting for more data
      setIsBuffering(true);
    };

    const handleProgress = () => {
      // Update buffering progress
      if (video.buffered.length > 0 && video.duration > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const percent = (bufferedEnd / video.duration) * 100;
        setBufferedPercent(percent);
      }
    };

    const handleLoadedMetadata = () => {
      // Metadata loaded, video is ready to start buffering
      // Keep buffering state as true until canplay fires
    };

    const handleCanPlayThrough = () => {
      // Enough data buffered to play through without stopping
      setIsBuffering(false);
    };

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplaythrough', handleCanPlayThrough);

    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplaythrough', handleCanPlayThrough);
    };
  }, [isVideo, url]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90"
      onClick={onClose}
      onTouchStart={(e) => {
        // Simple swipe down to close gesture
        const startY = e.touches[0].clientY;
        const handleTouchEnd = (endEvent: TouchEvent) => {
          const endY = endEvent.changedTouches[0].clientY;
          if (endY - startY > 150) {
            onClose();
          }
          document.removeEventListener('touchend', handleTouchEnd);
        };
        document.addEventListener('touchend', handleTouchEnd);
      }}
    >
      <button
        onClick={onClose}
        className="absolute text-white transition-colors top-4 right-4 hover:text-primary z-10 touch-manipulation"
        aria-label="Close"
        style={{ touchAction: 'manipulation' }}
      >
        <svg
          className="w-10 h-10 md:w-8 md:h-8"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      <div
        className="relative flex flex-col items-center max-w-[95vw] max-h-[95vh] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center max-w-full max-h-[85vh]">
          {isVideo ? (
            <div className="relative max-w-full max-h-[85vh]">
              <video
                ref={videoRef}
                src={url}
                controls
                autoPlay
                preload="auto"
                playsInline
                className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
                style={{ maxHeight: 'calc(100vh - 120px)' }}
              >
                Your browser does not support the video tag.
              </video>
              {isBuffering && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-50 rounded-lg">
                  <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-white text-sm">
                    {bufferedPercent > 0 ? `Buffering... ${Math.round(bufferedPercent)}%` : 'Loading video...'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <img
              src={url}
              alt={filename}
              className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
              onLoad={() => console.log('Image loaded successfully:', url)}
              onError={(e) => {
                console.error('Failed to load image:', url);
                console.error('Error event:', e);
                
                // Try to use the original thumbnail URL as fallback
                const currentSrc = e.currentTarget.src;
                console.log('Attempting fallback to thumbnail URL...');
                
                // Create a new image element to try the thumbnail URL
                const fallbackImg = new Image();
                fallbackImg.onload = () => {
                  console.log('Fallback image loaded successfully');
                  e.currentTarget.src = fallbackImg.src;
                  e.currentTarget.style.display = 'block';
                };
                fallbackImg.onerror = () => {
                  console.error('Fallback also failed');
                  // Show error message
                  e.currentTarget.style.display = 'none';
                  const fallbackDiv = document.createElement('div');
                  fallbackDiv.className = 'max-w-full max-h-[85vh] rounded-lg shadow-2xl bg-gray-800 flex items-center justify-center p-8';
                  
                  // Create elements safely to prevent XSS
                  const container = document.createElement('div');
                  container.className = 'text-center text-white';
                  
                  const title = document.createElement('p');
                  title.className = 'text-lg mb-2';
                  title.textContent = 'Image could not be displayed';
                  
                  const filenamePara = document.createElement('p');
                  filenamePara.className = 'text-sm text-gray-400';
                  filenamePara.textContent = filename; // Safe: textContent escapes HTML
                  
                  const hint = document.createElement('p');
                  hint.className = 'text-xs text-gray-500 mt-2';
                  hint.textContent = 'HEIC format may not be supported';
                  
                  container.appendChild(title);
                  container.appendChild(filenamePara);
                  container.appendChild(hint);
                  fallbackDiv.appendChild(container);
                  e.currentTarget.parentNode?.appendChild(fallbackDiv);
                };
                
                // Try the thumbnail URL (replace render/image with the thumbnail transformation)
                const thumbnailUrl = currentSrc.replace('/render/image/', '/render/image/').replace('600', '300');
                console.log('Trying thumbnail URL:', thumbnailUrl);
                fallbackImg.src = thumbnailUrl;
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

