/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1a472a', // Deep Forest Green
        primaryLight: '#2d5e40', // Lighter Forest Green
        secondary: '#c5a059', // Classic Gold
        accent: '#1e3a8a', // Navy Blue
        dark: '#2d2d2d', // Charcoal
        light: '#f8f5f2', // Cream/Off-white
        surface: '#ffffff', // Pure White
        muted: '#8c8c8c', // Neutral Gray
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'], // Modern, geometric sans
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        'card': '0 10px 30px -5px rgba(0, 0, 0, 0.08)',
        'floating': '0 20px 40px -10px rgba(0, 0, 0, 0.15)',
      },
      keyframes: {
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        }
      },
      animation: {
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'fade-out': 'fade-out 0.5s ease-out 3.5s forwards',
      }
    },
  },
  plugins: [],
}
