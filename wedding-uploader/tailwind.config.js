/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Match the RSVP page aesthetic
      colors: {
        'background': '#1a1a1a',
        'card': '#2b2b2b',
        'primary': '#7F00FF', // Bright purple accent
        'text-light': '#CCCCCC', // Body text
        'text-dark': '#F5F5F5', // Headings
      },
      fontFamily: {
        'sans': ['Lato', 'sans-serif'],
        'display': ['MedievalSharp', 'cursive'],
      },
    },
  },
  plugins: [],
};

