import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { GalleryItem, Upload } from './GalleryItem';
import { logAction } from '../utils/actionLog';

interface GalleryScreenProps {
  onShowUpload: () => void;
}

export function GalleryScreen({ onShowUpload }: GalleryScreenProps) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Remove upload from list when file is missing
  const handleFileMissing = (uploadId: number) => {
    setUploads(prevUploads => prevUploads.filter(upload => upload.id !== uploadId));
  };

  const listFolderFiles = useCallback(async (folderPath: string): Promise<Set<string> | null> => {
    const fileNames = new Set<string>();
    const PAGE_SIZE = 100;
    let offset = 0;

    try {
      while (true) {
        const { data, error } = await supabase.storage
          .from('guest-media')
          .list(folderPath, {
            limit: PAGE_SIZE,
            offset,
          });

        if (error) {
          console.warn(`Could not list storage folder ${folderPath}; keeping its uploads visible.`, error);
          return null;
        }

        for (const item of data) {
          if (item.name && item.name !== '.emptyFolderPlaceholder') {
            fileNames.add(item.name);
          }
        }

        if (data.length < PAGE_SIZE) {
          break;
        }

        offset += PAGE_SIZE;
      }

      return fileNames;
    } catch (error) {
      console.warn(`Could not verify folder ${folderPath}; keeping its uploads visible.`, error);
      return null;
    }
  }, []);

  // Verify uploads before first paint so stale records never flash on screen.
  const verifyUploads = useCallback(async (uploadsToVerify: Upload[]) => {
    if (uploadsToVerify.length === 0) {
      return { confirmedUploads: [], orphanedIds: [] as number[] };
    }

    setIsVerifying(true);
    console.log(`Verifying ${uploadsToVerify.length} files before render...`);

    const BATCH_SIZE = 5;
    const confirmedUploads: Upload[] = [];
    const orphanedIds: number[] = [];
    const uploadsByFolder = new Map<string, Upload[]>();

    try {
      for (const upload of uploadsToVerify) {
        const pathSegments = upload.file_path.split('/').filter(Boolean);
        const folderPath = pathSegments.slice(0, -1).join('/');

        if (!uploadsByFolder.has(folderPath)) {
          uploadsByFolder.set(folderPath, []);
        }

        uploadsByFolder.get(folderPath)?.push(upload);
      }

      const folderPaths = Array.from(uploadsByFolder.keys());

      for (let i = 0; i < folderPaths.length; i += BATCH_SIZE) {
        const batch = folderPaths.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (folderPath) => ({
            folderPath,
            fileNames: await listFolderFiles(folderPath),
          }))
        );

        for (const { folderPath, fileNames } of results) {
          const folderUploads = uploadsByFolder.get(folderPath) ?? [];

          // If verification fails for a folder, keep its uploads visible.
          if (fileNames === null) {
            confirmedUploads.push(...folderUploads);
            continue;
          }

          for (const upload of folderUploads) {
            const pathSegments = upload.file_path.split('/').filter(Boolean);
            const fileName = pathSegments[pathSegments.length - 1];

            if (fileName && fileNames.has(fileName)) {
              confirmedUploads.push(upload);
            } else {
              console.log(`File missing: ${upload.file_name} (${upload.file_path})`);
              orphanedIds.push(upload.id);
            }
          }
        }
      }

      return { confirmedUploads, orphanedIds };
    } finally {
      setIsVerifying(false);
    }
  }, [listFolderFiles]);

  const cleanupOrphanedRecords = useCallback(async (orphanedIds: number[]) => {
    if (orphanedIds.length === 0) return;

    console.log(`Cleaning up ${orphanedIds.length} orphaned records...`);

    await Promise.all(
      orphanedIds.map(async (id) => {
        try {
          await supabase.from('uploads').delete().eq('id', id);
          console.log(`Deleted orphaned record: ${id}`);
        } catch (deleteError) {
          console.error(`Failed to delete orphaned record ${id}:`, deleteError);
        }
      })
    );
  }, []);

  useEffect(() => {
    let isActive = true;
    let redirectTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchUploads = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from('uploads')
          .select('id, file_path, file_name')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Supabase error:', error);
          if (isActive) {
            setError(error.message);
          }
          return;
        }

        const validUploads = (data ?? []).filter(upload => upload.file_path);
        console.log('Fetched uploads:', validUploads);
        logAction('gallery_load', `${validUploads.length} records fetched`);

        const { confirmedUploads, orphanedIds } = await verifyUploads(validUploads);
        logAction('gallery_verify', `${confirmedUploads.length} confirmed, ${orphanedIds.length} orphaned`);

        if (!isActive) return;

        setUploads(confirmedUploads);

        if (orphanedIds.length > 0) {
          void cleanupOrphanedRecords(orphanedIds);
        }

        if (confirmedUploads.length === 0) {
          redirectTimer = setTimeout(() => {
            if (isActive) {
              onShowUpload();
            }
          }, 1500);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    fetchUploads();

    return () => {
      isActive = false;
      if (redirectTimer) {
        clearTimeout(redirectTimer);
      }
    };
  }, [cleanupOrphanedRecords, onShowUpload, verifyUploads]);

  return (
    <>
      <div className="w-full max-w-4xl p-8 space-y-6 rounded-2xl bg-card animate-scale-in">
        <div className="text-center stagger-1">
          <h1 className="text-5xl text-text-dark font-display flourish">Stag Do Gallery</h1>
          <p className="mt-5 text-xs text-gold italic tracking-wide font-celtic">the craic was mighty ☘️</p>
          <p className="mt-2 text-sm text-text-light">
            {uploads.length} {uploads.length === 1 ? 'memory' : 'memories'} shared
            {isVerifying && (
              <span className="ml-2 text-text-light/50 animate-pulse">
                (syncing...)
              </span>
            )}
          </p>
        </div>

        <div className="section-divider" />

        {isLoading && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="aspect-square skeleton" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        )}
        {error && (
          <div className="text-center">
            <p className="text-red-400">{error}</p>
            <p className="mt-2 text-sm text-text-light/50">
              Make sure you've added the file_path column to your uploads table.
            </p>
          </div>
        )}

        {!isLoading && !error && uploads.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-text-light">No photos uploaded yet.</p>
            <p className="mt-2 text-sm text-text-light/60 italic">
              Redirecting to upload page...
            </p>
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
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
