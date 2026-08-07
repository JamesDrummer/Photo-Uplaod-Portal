import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { GalleryItem, Upload } from './GalleryItem';
import { Lightbox } from './Lightbox';
import { logAction } from '../utils/actionLog';
import { withRetry } from '../utils/retry';

interface GalleryScreenProps { onShowUpload: () => void }

export function GalleryScreen({ onShowUpload }: GalleryScreenProps) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleFileMissing = (uploadId: number) => {
    setLightboxIndex(null);
    setUploads(current => current.filter(upload => upload.id !== uploadId));
  };

  useEffect(() => {
    let isActive = true;
    let redirectTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchUploads = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await withRetry(async () => {
          const result = await supabase
            .from('uploads')
            .select('id, file_path, file_name, thumbnail_path')
            .order('created_at', { ascending: false });
          if (result.error) throw result.error;
          return result.data as Upload[] | null;
        }, { maxAttempts: 3, label: 'fetch gallery uploads' });

        if (!isActive) return;
        const validUploads = (data ?? []).filter(upload => upload.file_path);
        setUploads(validUploads);
        logAction('gallery_load', `${validUploads.length} records fetched`);

        if (validUploads.length === 0) {
          redirectTimer = setTimeout(() => isActive && onShowUpload(), 1500);
        }
      } catch (fetchError) {
        console.error('Supabase error:', fetchError);
        if (isActive) setError('Could not load the gallery. Please check your connection and try again.');
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    void fetchUploads();
    return () => {
      isActive = false;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [onShowUpload]);

  return (
    <>
      <div className="w-full max-w-4xl p-8 space-y-6 rounded-2xl bg-card animate-scale-in">
        <div className="text-center stagger-1">
          <h1 className="text-5xl text-text-dark font-display flourish">Our Wedding Gallery</h1>
          <p className="mt-5 text-sm text-text-light">
            {uploads.length} {uploads.length === 1 ? 'memory' : 'memories'} shared
          </p>
        </div>
        <div className="section-divider" />

        {isLoading && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {[...Array(8)].map((_, index) => (
              <div key={index} className="aspect-square skeleton" style={{ animationDelay: `${index * 0.1}s` }} />
            ))}
          </div>
        )}
        {error && <p className="text-red-400 text-center">{error}</p>}
        {!isLoading && !error && uploads.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-text-light">No photos uploaded yet.</p>
            <p className="mt-2 text-sm text-text-light/60 italic">Redirecting to upload page...</p>
          </div>
        )}
        {!isLoading && !error && uploads.length > 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {uploads.map((upload, index) => (
              <GalleryItem
                key={upload.id}
                upload={upload}
                index={index}
                onFileMissing={handleFileMissing}
                onOpenLightbox={() => setLightboxIndex(index)}
              />
            ))}
          </div>
        )}
      </div>

      {createPortal(
        <div className="fixed right-6 bottom-6 sm:right-8 sm:bottom-8 z-[90]">
          <button
            onClick={onShowUpload}
            className="p-4 text-white rounded-full btn-luxe animate-pulse-soft hover:scale-110 transition-transform duration-300 touch-manipulation"
            title="Upload Photos"
            style={{ touchAction: 'manipulation' }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>,
        document.body,
      )}

      {lightboxIndex !== null && (
        <Lightbox
          uploads={uploads}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </>
  );
}
