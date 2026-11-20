/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Puzzle brand palette
        'puzzle-blue':  '#00406C',   // primary — 25% usage
        'puzzle-cyan':  '#29ABE0',   // accent   — 10% usage
        'puzzle-green': '#8CC63F',   // growth   —  5% usage
        'puzzle-ink':   '#001828',   // text dark
        'puzzle-paper': '#FCFCFC',   // background
      },
    },
  },
  plugins: [],
}
