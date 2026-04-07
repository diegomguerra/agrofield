import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Verde campo — cor primária
        field: {
          50: '#f0faf0',
          100: '#dcf5db',
          200: '#bbebba',
          300: '#8dda8b',
          400: '#58c256',
          500: '#33a831',
          600: '#238821',
          700: '#1d6c1c',
          800: '#1b561a',
          900: '#174717',
          950: '#0b2a0a',
        },
        // Marrom terra — cor secundária
        soil: {
          50: '#fdf7ef',
          100: '#faecda',
          200: '#f4d6b4',
          300: '#ecb983',
          400: '#e2934f',
          500: '#d9732c',
          600: '#ca5b21',
          700: '#a8451d',
          800: '#87391f',
          900: '#6e301c',
          950: '#3b160c',
        },
        // Cinza campo — neutros
        stone: {
          50: '#f8f7f4',
          100: '#efede8',
          200: '#dedad1',
          300: '#c8c2b5',
          400: '#b0a898',
          500: '#9a907e',
          600: '#857a6a',
          700: '#6e6457',
          800: '#5c5449',
          900: '#4d463d',
          950: '#28231d',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
        display: ['var(--font-syne)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '6px',
      },
    },
  },
  plugins: [],
}

export default config
