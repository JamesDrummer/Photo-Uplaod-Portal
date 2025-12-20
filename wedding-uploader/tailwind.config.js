/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Christmas theme colors
      colors: {
        'background': '#FFFEFA', // Warm white/snow
        'card': '#FFFFFF', // White cards with shadow
        'primary': '#C41E3A', // Christmas red
        'text-light': '#4A4A4A', // Dark gray for body text
        'text-dark': '#1A1A1A', // Near black for headings
      },
      fontFamily: {
        'sans': ['Lato', 'sans-serif'],
        'display': ['Christmas', 'MedievalSharp', 'cursive'],
      },
    },
  },
  plugins: [],
};

