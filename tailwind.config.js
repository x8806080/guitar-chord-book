/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        line: 'var(--line)',
        ink: 'var(--text)',
        muted: 'var(--muted)',
        chord: 'var(--chord)',
        accent: 'var(--accent)',
        accentFg: 'var(--accent-fg)',
        danger: 'var(--danger)',
      },
    },
  },
  plugins: [],
};
