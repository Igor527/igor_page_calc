/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      spacing: {
        'header': '56px',
        'footer': '56px',
        'content-top': '112px',
      },
    },
  },
  plugins: [],
};
