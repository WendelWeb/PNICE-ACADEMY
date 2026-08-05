import type { Config } from 'tailwindcss';

export default {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#10204A',
        paper: { DEFAULT: '#EDE6D6', light: '#F2EEE4' },
        ochre: { DEFAULT: '#D98E2B', soft: 'rgba(217,142,43,0.16)' },
        stampred: '#B23A2E',
        teal: '#1F6E66',
        graphite: '#2B2B28',
      },
      fontFamily: {
        // Stage 8 — next/font/google (app/fonts.ts) exposes each family as a
        // CSS variable on <html>; the quoted literal stays as a same-order
        // fallback for the rare render before the variable is set (e.g. the
        // noscript path) or a font that fails to load.
        display: ['var(--font-display)', '"Big Shoulders Display"', 'Impact', 'sans-serif'],
        body: ['var(--font-body)', '"Work Sans"', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', '"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      maxWidth: {
        page: '1120px',
      },
      keyframes: {
        stampIn: {
          '0%': { opacity: '0', transform: 'scale(1.18) rotate(-12deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(var(--sceau-rot, -6deg))' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        stampIn: 'stampIn 280ms cubic-bezier(.2,.8,.2,1) both',
        fadeUp: 'fadeUp 420ms cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
} satisfies Config;
