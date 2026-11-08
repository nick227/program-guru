import type { Config } from 'tailwindcss'
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: token('color-bg'),
        text: token('color-text'),
        foreground: token('color-text'),
        surface: {
          DEFAULT: token('color-surface'),
          raised: token('color-surface-raised'),
          muted: token('color-surface-muted'),
        },
        muted: { DEFAULT: token('color-muted'), foreground: token('color-muted') },
        accent: {
          DEFAULT: token('color-accent'),
          foreground: token('color-accent-fg'),
        },
        primary: {
          DEFAULT: token('color-accent'),
          foreground: token('color-accent-fg'),
        },
        focus: token('color-focus'),
        ring: token('color-focus'),
        border: token('color-border'),
        'input-border': token('color-border'),
        danger: token('color-danger'),
        destructive: {
          DEFAULT: token('color-danger'),
          foreground: '#fff',
        },
        success: token('color-success'),
        attention: token('color-attention'),
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
      },
    },
  },
} satisfies Config
