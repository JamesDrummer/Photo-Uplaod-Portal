import { useState, FormEvent, useEffect } from 'react';
import Turnstile from 'react-turnstile';
import { saveSession, getSession } from '../utils/sessionStorage';

// Get the password from env
const eventPassword = import.meta.env.VITE_APP_EVENT_PASSWORD;

interface PasswordScreenProps {
  onSuccess: (uploaderName: string) => void;
}

export function PasswordScreen({ onSuccess }: PasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  // Try to auto-fill name from session on mount
  useEffect(() => {
    const loadSession = async () => {
      try {
        const session = await getSession();
        if (session) {
          setName(session.name);
        }
      } catch (error) {
        // Silently fail - user can still enter their name manually
      }
    };
    loadSession();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!captchaToken) {
      setError('Please complete the security check.');
      return;
    }
    
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    
    if (password === eventPassword) {
      // Save session for future use
      try {
        await saveSession(name.trim(), password, 24); // 24 hour session
      } catch (error) {
        // Silently fail - session saving is optional
        console.error('Failed to save session:', error);
      }
      
      onSuccess(name.trim()); // Pass the name to App.tsx
    } else {
      setError('Incorrect Password. Please try again.');
    }
  };

  return (
    <div className="w-full max-w-md p-8 space-y-6 rounded-lg shadow-lg bg-card">
      <div className="text-center">
        <h1 className="text-5xl text-text-dark font-display">
          Family Christmas 2025
        </h1>
        <p className="mt-4 text-text-light">
          Please enter your name and the event password to upload your media.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label
            htmlFor="name"
            className="block mb-2 text-sm font-medium text-text-light"
          >
            Your Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            required
            className="w-full p-3 text-gray-800 placeholder-gray-400 bg-gray-50 border border-gray-300 rounded-md"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block mb-2 text-sm font-medium text-text-light"
          >
            Event Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full p-3 text-gray-800 placeholder-gray-400 bg-gray-50 border border-gray-300 rounded-md"
          />
        </div>

        {/* Turnstile CAPTCHA Widget */}
        <div className="flex justify-center">
          <Turnstile
            sitekey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
            onVerify={(token) => setCaptchaToken(token)}
            onError={() => {
              setCaptchaToken(null);
              setError('Security check failed. Please try again.');
            }}
            onExpire={() => setCaptchaToken(null)}
            theme="light"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={!captchaToken}
          className="w-full p-3 font-bold text-white transition-colors rounded-md bg-primary hover:bg-red-800 disabled:bg-gray-500 disabled:cursor-not-allowed"
        >
          Enter
        </button>
      </form>
    </div>
  );
}

