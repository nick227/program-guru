import type { Config } from 'tailwindcss'
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: token('background'),
        text: token('text'),
        foreground: token('text'),
        surface: {
          DEFAULT: token('surface'),
          raised: token('surface-raised'),
          muted: token('surface-muted'),
        },
        muted: { DEFAULT: token('muted'), foreground: token('muted') },
        accent: { DEFAULT: token('accent'), foreground: '#fff' },
        primary: { DEFAULT: token('accent'), foreground: '#fff' },
        focus: token('focus'),
        ring: token('focus'),
        border: token('border'),
        'input-border': token('border'),
        danger: token('danger'),
        destructive: { DEFAULT: token('danger'), foreground: '#fff' },
        success: token('success'),
        attention: token('attention'),
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'system-ui', 'sans-serif'],
        display: ['"Trebuchet MS"', '"Segoe UI"', 'sans-serif'],
        mono: ['ui-monospace', 'monospace'],
      },
      transitionDuration: { fast: '120ms', base: '200ms' },
    },
  },
} satisfies Config
