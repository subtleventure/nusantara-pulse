/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1a56db',
        secondary: '#7e3af2',
        accent: '#f59e0b',
        danger: '#e02424',
        success: '#0e9f6e',
      }
    },
  },
  plugins: [],
}
