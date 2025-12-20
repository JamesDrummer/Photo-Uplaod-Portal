import { useState, useEffect } from 'react';
import { PasswordScreen } from './components/PasswordScreen';
import { UploadScreen } from './components/UploadScreen';
import { GalleryScreen } from './components/GalleryScreen'; // Import new component
import { getSession, clearSession } from './utils/sessionStorage';

// Get the password from env
const eventPassword = import.meta.env.VITE_APP_EVENT_PASSWORD;

// Define the possible pages
type Page = 'password' | 'upload' | 'gallery';

function App() {
  // Update state to hold a string, not a boolean
  const [page, setPage] = useState<Page>('password');
  const [uploaderName, setUploaderName] = useState<string>('');
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);

  // Check for valid session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const session = await getSession();
        if (session) {
          // Verify the password is still correct (in case it changed)
          if (session.password === eventPassword) {
            setUploaderName(session.name);
            setPage('gallery');
          } else {
            // Password changed, clear invalid session
            clearSession();
            setPage('password');
          }
        } else {
          setPage('password');
        }
      } catch (error) {
        // If session check fails, show password screen
        console.error('Failed to check session:', error);
        setPage('password');
      } finally {
        setIsCheckingSession(false);
      }
    };

    checkSession();
  }, []);

  // Helper function to render the current page
  const renderPage = () => {
    switch (page) {
      case 'password':
        return <PasswordScreen onSuccess={(name) => {
          setUploaderName(name);
          setPage('gallery');
        }} />;
      case 'upload':
        return <UploadScreen 
          onShowGallery={() => setPage('gallery')} 
          uploaderName={uploaderName}
        />;
      case 'gallery':
        return <GalleryScreen onShowUpload={() => setPage('upload')} />;
      default:
        return <PasswordScreen onSuccess={(name) => {
          setUploaderName(name);
          setPage('gallery');
        }} />;
    }
  };

  return (
    <>
      {/* Animated snowflakes */}
      <div className="snowflakes" aria-hidden="true">
        {/* Original 10 snowflakes */}
        <div className="snowflake">❄</div>
        <div className="snowflake">❅</div>
        <div className="snowflake">❆</div>
        <div className="snowflake">❄</div>
        <div className="snowflake">❅</div>
        <div className="snowflake">❆</div>
        <div className="snowflake">❄</div>
        <div className="snowflake">❅</div>
        <div className="snowflake">❆</div>
        <div className="snowflake">❄</div>
        {/* Original 5 stars */}
        <div className="snowflake star">✦</div>
        <div className="snowflake star">✧</div>
        <div className="snowflake star">✦</div>
        <div className="snowflake star">✧</div>
        <div className="snowflake star">✦</div>
        {/* Additional 10 snowflakes */}
        <div className="snowflake">❅</div>
        <div className="snowflake">❆</div>
        <div className="snowflake">❄</div>
        <div className="snowflake">❅</div>
        <div className="snowflake">❆</div>
        <div className="snowflake">❄</div>
        <div className="snowflake">❅</div>
        <div className="snowflake">❆</div>
        <div className="snowflake">❄</div>
        <div className="snowflake">❅</div>
        {/* Additional 5 stars */}
        <div className="snowflake star">✧</div>
        <div className="snowflake star">✦</div>
        <div className="snowflake star">✧</div>
        <div className="snowflake star">✦</div>
        <div className="snowflake star">✧</div>
      </div>
      
      {/* Corner glow decoration */}
      <div className="corner-glow" aria-hidden="true"></div>
      
      {/* Main content */}
      <div className="flex items-center justify-center min-h-screen px-4 py-12">
        {isCheckingSession ? (
          <div className="w-full max-w-md p-8 space-y-6 rounded-lg shadow-lg bg-card">
            <div className="text-center">
              <p className="text-text-light">Loading...</p>
            </div>
          </div>
        ) : (
          renderPage()
        )}
      </div>
    </>
  );
}

export default App;

