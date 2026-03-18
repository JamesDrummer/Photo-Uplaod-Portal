/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Irish Stag Do theme colors
      colors: {
        'background': '#0F1A0F', // Deep dark forest green
        'card': '#1A2B1A', // Dark card green
        'primary': '#2E8B57', // Sea green (Irish green)
        'primary-hover': '#3CB371', // Medium sea green
        'text-light': '#A8C5A0', // Soft sage
        'text-dark': '#E8F0E4', // Off-white green tint
        'gold': '#DAA520', // Goldenrod (Guinness gold)
        'amber': '#C68E17', // Dark amber (whiskey)
        'cream': '#F5E6C8', // Guinness cream
        'wood': '#5C3317', // Dark wood brown
      },
      fontFamily: {
        'sans': ['Inter', 'sans-serif'],
        'display': ['Cinzel', 'serif'],
        'celtic': ['Uncial Antiqua', 'cursive'],
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
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(46, 139, 87, 0.4)' },
          '50%': { boxShadow: '0 0 0 10px rgba(46, 139, 87, 0)' },
        },
      },
    },
  },
  plugins: [],
};
