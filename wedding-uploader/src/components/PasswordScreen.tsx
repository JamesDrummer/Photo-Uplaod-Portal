import { useState, FormEvent } from 'react';

// Get the password from env
const eventPassword = import.meta.env.VITE_APP_EVENT_PASSWORD;

interface PasswordScreenProps {
  onSuccess: () => void;
}

export function PasswordScreen({ onSuccess }: PasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (password === eventPassword) {
      onSuccess(); // Call the function passed from App.tsx
    } else {
      setError('Incorrect Password. Please try again.');
    }
  };

  return (
    <div className="w-full max-w-md p-8 space-y-6 rounded-lg shadow-lg bg-card">
      <div className="text-center">
        <h1 className="text-5xl text-white font-display">
          Elise & James' Wedding
        </h1>
        <p className="mt-4 text-text-light">
          Please enter the event password to upload your media.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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
            className="w-full p-3 text-white placeholder-gray-400 bg-gray-700 border border-gray-600 rounded-md"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          className="w-full p-3 font-bold text-white transition-colors rounded-md bg-primary hover:bg-purple-700"
        >
          Enter
        </button>
      </form>
    </div>
  );
}

