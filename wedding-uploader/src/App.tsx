import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PasswordScreen } from './components/PasswordScreen';
import { UploadScreen } from './components/UploadScreen';
import { GalleryScreen } from './components/GalleryScreen';
import { BugReportModal } from './components/BugReportModal';
import { getSession, clearSession } from './utils/sessionStorage';
import { logAction } from './utils/actionLog';

// Get the password from env
const eventPassword = import.meta.env.VITE_APP_EVENT_PASSWORD;

// Define the possible pages
type Page = 'password' | 'upload' | 'gallery';

function App() {
  const [page, setPage] = useState<Page>('password');
  const [uploaderName, setUploaderName] = useState<string>('');
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);
  const [showBugReport, setShowBugReport] = useState(false);

  // Check for valid session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const session = await getSession();
        if (session) {
          if (session.password === eventPassword) {
            setUploaderName(session.name);
            setPage('gallery');
          } else {
            clearSession();
            setPage('password');
          }
        } else {
          setPage('password');
        }
      } catch (error) {
        console.error('Failed to check session:', error);
        setPage('password');
      } finally {
        setIsCheckingSession(false);
      }
    };

    checkSession();
  }, []);

  const renderPage = () => {
    switch (page) {
      case 'password':
        return <PasswordScreen onSuccess={(name) => {
          setUploaderName(name);
          logAction('login_success', name);
          logAction('page_navigate', 'upload');
          setPage('upload');
        }} />;
      case 'upload':
        return <UploadScreen
          onShowGallery={() => {
            logAction('page_navigate', 'gallery');
            setPage('gallery');
          }}
          uploaderName={uploaderName}
        />;
      case 'gallery':
        return <GalleryScreen onShowUpload={() => {
          logAction('page_navigate', 'upload');
          setPage('upload');
        }} />;
      default:
        return <PasswordScreen onSuccess={(name) => {
          setUploaderName(name);
          setPage('upload');
        }} />;
    }
  };

  return (
    <>
      <div className="wedding-atmosphere" aria-hidden="true">
        <span>✦</span>
        <span>✧</span>
        <span>✦</span>
        <span>✧</span>
      </div>

      {/* Main content */}
      <div className="flex items-center justify-center min-h-screen px-4 py-12 sm:py-16">
        {isCheckingSession ? (
          <div className="w-full max-w-md p-8 rounded-2xl bg-card">
            <div className="flex flex-col items-center justify-center py-8">
              <div className="luxe-spinner"></div>
              <p className="mt-4 text-sm text-text-light italic font-script">Loading...</p>
            </div>
          </div>
        ) : (
          renderPage()
        )}
      </div>

      {/* Bug report FAB */}
      {createPortal(
        <div className="fixed left-6 bottom-6 sm:left-8 sm:bottom-8 z-[90]">
          <button
            onClick={() => setShowBugReport(true)}
            className="flex items-center justify-center w-11 h-11 rounded-full bg-card/80 backdrop-blur-sm border border-primary/30 shadow-md text-text-light hover:bg-card hover:shadow-lg hover:text-gold transition-all duration-200 touch-manipulation"
            title="Report a Bug"
            style={{ touchAction: 'manipulation' }}
            aria-label="Report a bug"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>,
        document.body
      )}

      {/* Bug report modal */}
      {showBugReport && (
        <BugReportModal
          currentPage={page}
          reporterName={uploaderName || undefined}
          onClose={() => setShowBugReport(false)}
        />
      )}
    </>
  );
}

export default App;
