import { useState } from 'react';
import { PasswordScreen } from './components/PasswordScreen';
import { UploadScreen } from './components/UploadScreen';
import { GalleryScreen } from './components/GalleryScreen'; // Import new component

// Define the possible pages
type Page = 'password' | 'upload' | 'gallery';

function App() {
  // Update state to hold a string, not a boolean
  const [page, setPage] = useState<Page>('password');

  // Helper function to render the current page
  const renderPage = () => {
    switch (page) {
      case 'password':
        return <PasswordScreen onSuccess={() => setPage('gallery')} />;
      case 'upload':
        return <UploadScreen onShowGallery={() => setPage('gallery')} />;
      case 'gallery':
        return <GalleryScreen onShowUpload={() => setPage('upload')} />;
      default:
        return <PasswordScreen onSuccess={() => setPage('gallery')} />;
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-4 py-12">
      {renderPage()}
    </div>
  );
}

export default App;

