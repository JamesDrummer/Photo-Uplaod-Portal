/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // James & Elise wedding palette, shared with jameselisewedding.uk
      colors: {
        'background': '#121212',
        'card': '#1E1E1E',
        'primary': '#6D28D9',
        'primary-hover': '#7C3AED',
        'accent': '#FACC15',
        'text-light': '#D1D5DB',
        'text-dark': '#FFFFFF',
        'gold': '#FACC15',
        'amber': '#D7A910',
        'cream': '#F4EFE6',
        'wood': '#4B3A54',
      },
      fontFamily: {
        'sans': ['Montserrat', 'sans-serif'],
        'display': ['"Gothic Blackletter"', 'serif'],
        'script': ['"Cormorant Garamond"', 'serif'],
      },
      animation: {
        'scale-in': 'scaleIn 0.5s ease-out forwards',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(250, 204, 21, 0.32)' },
          '50%': { boxShadow: '0 0 0 12px rgba(250, 204, 21, 0)' },
        },
      },
    },
  },
  plugins: [],
};
