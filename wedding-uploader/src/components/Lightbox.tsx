import { useEffect } from 'react';

interface LightboxProps {
  url: string;
  filename: string;
  isVideo: boolean;
  onClose: () => void;
}

export function Lightbox({ url, filename, isVideo, onClose }: LightboxProps) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

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
            <video
              src={url}
              controls
              autoPlay
              className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
              style={{ maxHeight: 'calc(100vh - 120px)' }}
            >
              Your browser does not support the video tag.
            </video>
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
                  fallbackDiv.innerHTML = `
                    <div class="text-center text-white">
                      <p class="text-lg mb-2">Image could not be displayed</p>
                      <p class="text-sm text-gray-400">${filename}</p>
                      <p class="text-xs text-gray-500 mt-2">HEIC format may not be supported</p>
                    </div>
                  `;
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

