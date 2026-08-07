import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { convertToJpeg, formatFileSize, generateThumbnail } from '../utils/imageConverter';
import { hasValidFileSignature, validateSelection, ValidatedFile } from '../utils/fileSelection';
import { createStableUploadPrefixFactory, filesForRetry, isDuplicateStorageError, runSequentially, SequentialResult, summariseResults } from '../utils/uploadPipeline';
import { logAction } from '../utils/actionLog';
import { withRetry } from '../utils/retry';

interface UploadScreenProps {
  onShowGallery: () => void;
  uploaderName: string;
}

const sanitiseFilename = (filename: string) => filename
  .replace(/\.\./g, '')
  .replace(/[/\\]/g, '_')
  .replace(/^[/\\]+|[/\\]+$/g, '')
  .trim() || 'file';

const sanitiseUserInput = (input: string) => input
  .replace(/<[^>]*>/g, '')
  .replace(/[<>"']/g, '')
  .trim()
  .substring(0, 100);

export function UploadScreen({ onShowGallery, uploaderName }: UploadScreenProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const getUploadPrefix = useRef(createStableUploadPrefixFactory()).current;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    const { accepted, rejected } = validateSelection(selected);
    setFiles(accepted.map(item => item.file));
    setSuccessMessage('');
    setError(rejected.map(item => item.reason).join(' '));
  };

  const uploadFile = async ({ file: source, kind }: ValidatedFile): Promise<string> => {
    if (!await hasValidFileSignature(source, kind)) {
      throw new Error('file contents do not match a supported photo or video format');
    }

    let file = source;
    if (kind === 'image') {
      setSuccessMessage(`Processing ${source.name}...`);
      file = await convertToJpeg(source, 0.8);
    } else if (kind === 'video') {
      setSuccessMessage(`Checking ${source.name}...`);
      const { reencodeVideoTo720p } = await import('../utils/videoConverter');
      file = await reencodeVideoTo720p(source, progress => setSuccessMessage(progress.message));
    }

    const safeName = sanitiseFilename(file.name);
    const uniquePrefix = getUploadPrefix(source);
    const filePath = `public/${uniquePrefix}-${safeName}`;
    const contentType = kind === 'gif' ? 'image/gif' : kind === 'image' ? 'image/jpeg' : 'video/mp4';
    setSuccessMessage(`Uploading ${source.name}...`);

    await withRetry(async () => {
      const { error: uploadError } = await supabase.storage.from('guest-media').upload(filePath, file, {
        contentType,
        upsert: false,
      });
      if (uploadError && !isDuplicateStorageError(uploadError)) throw uploadError;
    }, { maxAttempts: 3, label: `file upload for ${source.name}` }).catch(() => {
      throw new Error(`upload failed (${formatFileSize(source.size)}); please check your connection and try again`);
    });

    let thumbnailPath: string | null = null;
    if (kind === 'image') {
      const thumbnail = await generateThumbnail(file);
      if (thumbnail) {
        thumbnailPath = `public/${uniquePrefix}-${sanitiseFilename(thumbnail.name)}`;
        try {
          await withRetry(async () => {
            const { error: thumbnailError } = await supabase.storage.from('guest-media').upload(thumbnailPath!, thumbnail, {
              contentType: 'image/jpeg',
              upsert: false,
            });
            if (thumbnailError && !isDuplicateStorageError(thumbnailError)) throw thumbnailError;
          }, { maxAttempts: 3, label: `thumbnail upload for ${source.name}` });
        } catch {
          thumbnailPath = null;
        }
      }
    }

    const { data: urlData } = supabase.storage.from('guest-media').getPublicUrl(filePath);
    if (!urlData?.publicUrl) throw new Error('could not create a public file URL');

    const record = {
        file_name: safeName,
        file_url: urlData.publicUrl,
        file_path: filePath,
        thumbnail_path: thumbnailPath,
        uploader_name: sanitiseUserInput(uploaderName),
    };
    const recordExists = () => withRetry(async () => {
      const { data, error: lookupError } = await supabase
        .from('uploads')
        .select('id')
        .eq('file_path', filePath)
        .limit(1);
      if (lookupError) throw lookupError;
      return Boolean(data?.length);
    }, { maxAttempts: 3, label: `database lookup for ${source.name}` });

    if (!await recordExists()) {
      try {
        const { error: databaseError } = await supabase.from('uploads').insert(record);
        if (databaseError) throw databaseError;
      } catch {
        if (!await recordExists()) {
          throw new Error('file uploaded but could not be added to the gallery; please try again');
        }
      }
    }

    return source.name;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isSupabaseConfigured()) {
      setError('Uploads are not configured. Please ask James or Elise for help.');
      return;
    }
    if (files.length === 0) {
      setError('Please select at least one file to upload.');
      return;
    }

    setIsUploading(true);
    setError('');
    setSuccessMessage('');
    logAction('upload_start', `${files.length} file(s) selected`);

    const { accepted, rejected } = validateSelection(files);
    const processed = await runSequentially(accepted.map(item => item.file), async file => {
      const validated = accepted.find(item => item.file === file);
      if (!validated) throw new Error('file validation was lost');
      return uploadFile(validated);
    });
    const rejectedResults: SequentialResult<string>[] = rejected.map(item => ({
      file: item.file,
      ok: false,
      error: item.reason.replace(`${item.file.name}: `, ''),
    }));
    const results = [...processed, ...rejectedResults];
    const summary = summariseResults(results);

    setSuccessMessage(summary.successMessage);
    setError(summary.errorMessage);
    const succeeded = processed.filter(result => result.ok).length;
    if (succeeded > 0) logAction('upload_success', `${succeeded} file(s) uploaded`);
    if (summary.errorMessage) logAction('upload_error', `${rejectedResults.length + processed.filter(result => !result.ok).length} file(s) failed`);

    if (summary.allSucceeded) {
      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
    } else {
      setFiles(filesForRetry(results));
    }
    setIsUploading(false);
  };

  return (
    <>
      <div className="w-full max-w-md p-8 space-y-6 rounded-2xl bg-card animate-scale-in">
        <div className="text-center stagger-1">
          <h1 className="text-5xl text-text-dark font-display flourish">Share a Memory</h1>
          <p className="mt-6 text-4xl text-gold font-script italic">Welcome, {uploaderName}</p>
          <p className="mt-2 text-text-light italic text-sm font-script">Upload your favourite moments from our wedding day</p>
        </div>
        <div className="section-divider" />
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="stagger-2">
            <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full p-6 border-2 border-dashed border-primary/35 rounded-xl bg-background/40 hover:bg-background/60 hover:border-primary/55 transition-all duration-300 cursor-pointer">
              <svg className="w-8 h-8 text-primary/60 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-sm text-text-light">Tap to select photos &amp; videos</span>
              {files.length > 0 && <span className="mt-2 px-3 py-1 text-xs font-medium text-white bg-primary/80 rounded-full">{files.length} file{files.length === 1 ? '' : 's'} selected</span>}
              <input ref={inputRef} id="file-upload" name="file-upload" type="file" multiple onChange={handleFileChange} accept="image/*,video/*,.heic,.heif,.mov,.m4v,.mkv,.webm" className="hidden" />
            </label>
            <p className="mt-2 text-xs text-text-light/60 text-center">Up to 5 files. Images and GIFs: 30 MB maximum. Videos: 50 MB maximum.</p>
          </div>
          {error && <p className="text-sm text-red-400 text-center">{error}</p>}
          {successMessage && <p className="text-sm text-gold italic text-center">{successMessage}</p>}
          <button type="submit" disabled={isUploading || files.length === 0} className="w-full py-3.5 px-6 font-bold text-white rounded-full btn-luxe tracking-wide">
            {isUploading ? 'Uploading...' : 'Upload Files'}
          </button>
        </form>
      </div>
      {createPortal(
        <div className="fixed right-6 bottom-6 sm:right-8 sm:bottom-8 z-[90]">
          <button onClick={onShowGallery} className="p-4 text-white rounded-full btn-luxe animate-pulse-soft hover:scale-110 transition-transform duration-300 touch-manipulation" title="View Gallery" style={{ touchAction: 'manipulation' }}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
