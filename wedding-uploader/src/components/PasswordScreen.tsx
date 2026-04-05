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

      onSuccess(name.trim());
    } else {
      setError('Incorrect Password. Please try again.');
    }
  };

  return (
    <div className="w-full max-w-md p-8 space-y-6 rounded-2xl bg-card animate-scale-in">
      <div className="text-center stagger-1">
        <p className="mb-2 text-[0.7rem] text-text-light uppercase tracking-[0.3em]">
          Together with their families
        </p>
        <h1 className="text-5xl text-text-dark font-display font-semibold flourish leading-tight">
          Danielle <span className="font-script text-gold text-6xl align-middle">&amp;</span> Marcus
        </h1>
        <p className="mt-3 text-sm text-primary tracking-wide italic font-display">
          11 April 2026
        </p>
        <p className="mt-4 text-text-light italic font-display">
          Enter your name and the event password to share your memories with us
        </p>
      </div>

      <div className="section-divider" />

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="stagger-2">
          <label
            htmlFor="name"
            className="block mb-2 text-xs font-medium text-text-light uppercase tracking-widest"
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
            className="w-full p-3 text-text-dark placeholder-text-light/40 bg-background/60 border border-primary/25 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 focus:bg-background/80 transition-all duration-300"
          />
        </div>

        <div className="stagger-3">
          <label
            htmlFor="password"
            className="block mb-2 text-xs font-medium text-text-light uppercase tracking-widest"
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
            className="w-full p-3 text-text-dark placeholder-text-light/40 bg-background/60 border border-primary/25 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 focus:bg-background/80 transition-all duration-300"
          />
        </div>

        {/* Turnstile CAPTCHA Widget */}
        <div className="flex justify-center stagger-4">
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

        {error && <p className="text-sm text-red-400 text-center">{error}</p>}

        <div className="stagger-5">
          <button
            type="submit"
            disabled={!captchaToken}
            className="w-full py-3.5 px-6 font-bold text-white rounded-full btn-luxe tracking-wide"
          >
            Enter
          </button>
        </div>
      </form>
    </div>
  );
}
