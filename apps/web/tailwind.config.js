/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: 'var(--color-brand, #E535AB)',
        'brand-light': 'var(--color-brand-light, #FFA5D6)',
        'brand-dark': 'var(--color-brand-dark, #C41E7A)',
      },
    },
  },
  plugins: [],
}
