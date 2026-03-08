/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Hen Do theme colors
      colors: {
        'background': '#FFF5F7', // Soft blush white
        'card': '#FFFFFF', // White cards with shadow
        'primary': '#D4849A', // Dusty rose
        'primary-hover': '#C06E84', // Deeper rose
        'text-light': '#6B5B6E', // Warm grey-purple
        'text-dark': '#2D1F2D', // Deep plum-black
        'gold': '#D4AF6A', // Champagne gold
      },
      fontFamily: {
        'sans': ['Lato', 'sans-serif'],
        'display': ['Playfair Display', 'serif'],
        'script': ['Great Vibes', 'cursive'],
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
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(212, 132, 154, 0.4)' },
          '50%': { boxShadow: '0 0 0 10px rgba(212, 132, 154, 0)' },
        },
      },
    },
  },
  plugins: [],
};
