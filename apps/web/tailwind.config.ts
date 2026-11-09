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
        status: {
          planned: token('color-status-planned'),
          active: token('color-status-active'),
          completed: token('color-status-completed'),
          paused: token('color-status-paused'),
          unavailable: token('color-status-unavailable'),
        },
        cat: {
          fitness: token('cat-fitness'),
          'fitness-fg': token('cat-fitness-fg'),
          wellness: token('cat-wellness'),
          'wellness-fg': token('cat-wellness-fg'),
          education: token('cat-education'),
          'education-fg': token('cat-education-fg'),
          finance: token('cat-finance'),
          'finance-fg': token('cat-finance-fg'),
          relationships: token('cat-relationships'),
          'relationships-fg': token('cat-relationships-fg'),
          custom: token('cat-custom'),
          'custom-fg': token('cat-custom-fg'),
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
      },
      maxWidth: {
        focused: 'var(--width-focused)',
        content: 'var(--width-content)',
        wide: 'var(--width-wide)',
      },
      aspectRatio: {
        hero: '16 / 9',
        preview: '4 / 3',
        thumb: '1 / 1',
        'profile-cover': '3 / 1',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
      },
    },
  },
} satisfies Config
