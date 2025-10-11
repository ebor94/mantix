// ============================================
// tailwind.config.js - Configuración con colores Serfunorte
// ============================================
import('tailwindcss').Config
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e6f7f1',
          100: '#b3e6d4',
          200: '#80d5b7',
          300: '#4dc49a',
          400: '#1ab37d',
          500: '#00875c', // Color principal Serfunorte
          600: '#006d4a',
          700: '#005a3d', // Color secundario
          800: '#004730',
          900: '#003423',
        },
        secondary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
