/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Bridgerton wedding theme colors (Danielle & Marcus)
      colors: {
        'background': '#EEF1F8', // Pale dusty-blue paper tone
        'card': '#FFFFFF', // White card
        'primary': '#1E3A6B', // Deep Bridgerton navy
        'primary-hover': '#2B4E89', // Lighter navy
        'accent': '#B8C5E0', // Powder blue
        'text-light': '#4A5B7A', // Slate-blue body text
        'text-dark': '#1E3A6B', // Navy for headings
        'gold': '#C9A961', // Muted regency gilt
        'amber': '#A88A48', // Darker gilt
        'cream': '#F6F1E4', // Warm cream
        'wood': '#8A7A5C', // Soft taupe
      },
      fontFamily: {
        'sans': ['Inter', 'sans-serif'],
        'display': ['"Cormorant Garamond"', 'serif'],
        'script': ['"Great Vibes"', 'cursive'],
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
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(30, 58, 107, 0.4)' },
          '50%': { boxShadow: '0 0 0 10px rgba(30, 58, 107, 0)' },
        },
      },
    },
  },
  plugins: [],
};
