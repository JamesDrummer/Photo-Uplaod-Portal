import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { getActionLog } from '../utils/actionLog';

interface BugReportModalProps {
  currentPage: string;
  reporterName?: string;
  onClose: () => void;
}

export function BugReportModal({ currentPage, reporterName, onClose }: BugReportModalProps) {
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Lock scroll and focus textarea on open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    textareaRef.current?.focus();
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!description.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const { error: dbError } = await supabase.from('bug_reports').insert({
        description: description.trim(),
        reporter_name: reporterName ?? null,
        current_page: currentPage,
        action_log: getActionLog(),
        user_agent: navigator.userAgent,
      });

      if (dbError) throw new Error(dbError.message);

      setSubmitted(true);
      setTimeout(() => onClose(), 2000);
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm mx-4 p-6 rounded-2xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 text-text-light transition-colors"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {submitted ? (
          <div className="py-6 text-center">
            <div className="text-3xl mb-3">🐛</div>
            <p className="text-text-dark font-medium">Thanks for reporting!</p>
            <p className="mt-1 text-sm text-text-light italic">We'll look into it shortly.</p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <h2 className="text-xl text-text-dark font-display">Report a Bug</h2>
              <p className="mt-1 text-xs text-text-light italic">
                Describe what went wrong and we'll investigate.
              </p>
            </div>

            <textarea
              ref={textareaRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. The gallery didn't load after I uploaded a photo..."
              rows={4}
              className="w-full px-3 py-2.5 text-sm text-text-dark bg-white/60 border border-primary/20 rounded-xl resize-none outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-text-light/50"
            />

            {error && (
              <p className="mt-2 text-xs text-red-400">{error}</p>
            )}

            <p className="mt-2 text-xs text-text-light/50">
              Your recent actions on this page will be included automatically to help with debugging.
            </p>

            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !description.trim()}
              className="mt-4 w-full py-3 px-4 text-sm font-semibold text-white rounded-full btn-luxe transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Sending...' : 'Send Report'}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
