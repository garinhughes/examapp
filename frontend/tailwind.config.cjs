/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx,html}'
  ],
  theme: {
    extend: {
      colors: {
        neon: {
          pink: '#ff00cc',
          cyan: '#00fff5',
          lime: '#b7ff00',
          purple: '#8a2be2'
        }
      }
    }
  },
  plugins: []
}
