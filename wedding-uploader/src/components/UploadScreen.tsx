import { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../supabaseClient';

// Add this new prop
interface UploadScreenProps {
  onShowGallery: () => void;
}

export function UploadScreen({ onShowGallery }: UploadScreenProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);

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

    const uploadPromises = Array.from(files).map(async (file) => {
      // Create a unique file path
      const filePath = `public/${Date.now()}-${file.name}`;

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
      //    **MODIFICATION: Add file_path**
      const { error: dbError } = await supabase
        .from('uploads')
        .insert({
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_path: filePath, // <-- ADD THIS LINE
        });
      
      if (dbError) {
        throw new Error(`Database logging failed: ${dbError.message}`);
      }

      return file.name;
    });

    try {
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
        <h1 className="text-5xl text-white font-display">
          Upload Your Memories
        </h1>
        <p className="mt-4 text-text-light">
          We'd love to see the day from your perspective!
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
            accept="image/*,video/*"
            className="block w-full text-sm rounded-lg cursor-pointer text-text-light file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-purple-700"
          />
          <p className="mt-1 text-xs text-gray-400">
            You can select multiple files at once.
          </p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {successMessage && (
          <p className="text-sm text-green-400">{successMessage}</p>
        )}

        <button
          type="submit"
          disabled={isUploading}
          className="w-full p-3 font-bold text-white transition-colors rounded-md bg-primary hover:bg-purple-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
        >
          {isUploading ? 'Uploading...' : 'Upload Files'}
        </button>
      </form>

      {/* Floating Gallery Button */}
      <button
        onClick={onShowGallery}
        className="fixed p-4 text-white transition-all duration-300 rounded-full shadow-lg bottom-8 right-8 bg-primary hover:bg-purple-700 hover:scale-110 touch-manipulation z-[60]"
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

