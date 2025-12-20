import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { GalleryItem, Upload } from './GalleryItem';

interface GalleryScreenProps {
  onShowUpload: () => void;
}

export function GalleryScreen({ onShowUpload }: GalleryScreenProps) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verificationRan = useRef(false);

  // Remove upload from list when file is missing
  const handleFileMissing = (uploadId: number) => {
    setUploads(prevUploads => prevUploads.filter(upload => upload.id !== uploadId));
  };

  // Verify if a file exists in storage using HEAD request
  const verifyFileExists = useCallback(async (filePath: string): Promise<boolean> => {
    const { data } = supabase.storage
      .from('guest-media')
      .getPublicUrl(filePath);
    
    try {
      const response = await fetch(data.publicUrl, { 
        method: 'HEAD',
        cache: 'no-store' // Bypass browser cache
      });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  // Background verification to clean up orphaned records
  const verifyAndCleanup = useCallback(async (uploadsToVerify: Upload[]) => {
    if (uploadsToVerify.length === 0) return;
    
    setIsVerifying(true);
    console.log(`Verifying ${uploadsToVerify.length} files...`);
    
    const BATCH_SIZE = 5; // Process 5 files at a time to avoid rate limiting
    const orphanedIds: number[] = [];
    
    for (let i = 0; i < uploadsToVerify.length; i += BATCH_SIZE) {
      const batch = uploadsToVerify.slice(i, i + BATCH_SIZE);
      
      const results = await Promise.all(
        batch.map(async (upload) => {
          const exists = await verifyFileExists(upload.file_path);
          return { upload, exists };
        })
      );
      
      for (const { upload, exists } of results) {
        if (!exists) {
          console.log(`File missing: ${upload.file_name} (${upload.file_path})`);
          orphanedIds.push(upload.id);
          
          // Delete orphaned database record
          try {
            await supabase.from('uploads').delete().eq('id', upload.id);
            console.log(`Deleted orphaned record: ${upload.id}`);
          } catch (deleteError) {
            console.error('Failed to delete orphaned record:', deleteError);
          }
        }
      }
      
      // Small delay between batches to be gentle on the server
      if (i + BATCH_SIZE < uploadsToVerify.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Remove orphaned items from UI
    if (orphanedIds.length > 0) {
      console.log(`Removed ${orphanedIds.length} orphaned items`);
      setUploads(prev => prev.filter(u => !orphanedIds.includes(u.id)));
    }
    
    setIsVerifying(false);
  }, [verifyFileExists]);

  useEffect(() => {
    const fetchUploads = async () => {
      setIsLoading(true);
      setError(null);
      
      const { data, error } = await supabase
        .from('uploads')
        .select('id, file_path, file_name')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error:', error);
        setError(error.message);
      } else if (data) {
        console.log('Fetched uploads:', data);
        // Filter out uploads without file_path (from before the update)
        const validUploads = data.filter(upload => upload.file_path);
        setUploads(validUploads);
        
        // If gallery is empty, redirect to upload screen
        if (validUploads.length === 0) {
          setTimeout(() => onShowUpload(), 1500);
        }
      }
      setIsLoading(false);
    };

    fetchUploads();
  }, [onShowUpload]);

  // Run background verification after uploads are loaded
  useEffect(() => {
    if (!isLoading && uploads.length > 0 && !verificationRan.current) {
      verificationRan.current = true;
      // Small delay to let the UI render first
      const timer = setTimeout(() => {
        verifyAndCleanup(uploads);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, uploads, verifyAndCleanup]);

  return (
    <div className="w-full max-w-4xl p-8 space-y-6 rounded-lg shadow-lg bg-card">
      <div className="text-center">
        <h1 className="text-5xl text-text-dark font-display">Family Gallery</h1>
        <p className="mt-2 text-sm text-text-light">
          {uploads.length} {uploads.length === 1 ? 'memory' : 'memories'} shared
          {isVerifying && (
            <span className="ml-2 text-gray-400 animate-pulse">
              (syncing...)
            </span>
          )}
        </p>
      </div>

      {/* Floating Upload Button */}
      <button
        onClick={onShowUpload}
        className="fixed p-4 text-white transition-all duration-300 rounded-full shadow-lg bottom-8 right-8 bg-primary hover:bg-red-800 hover:scale-110 touch-manipulation z-40"
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

      {isLoading && <p className="text-center text-text-light">Loading...</p>}
      {error && (
        <div className="text-center">
          <p className="text-red-400">{error}</p>
          <p className="mt-2 text-sm text-gray-400">
            Make sure you've added the file_path column to your uploads table.
          </p>
        </div>
      )}

      {!isLoading && !error && uploads.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-text-light">No photos uploaded yet.</p>
          <p className="mt-2 text-sm text-gray-400">
            Redirecting to upload page...
          </p>
        </div>
      )}

      {!isLoading && !error && uploads.length > 0 && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
          {uploads.map((upload) => (
            <GalleryItem 
              key={upload.id} 
              upload={upload} 
              onFileMissing={handleFileMissing}
            />
          ))}
        </div>
      )}
    </div>
  );
}

