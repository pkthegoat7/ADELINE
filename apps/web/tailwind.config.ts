import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Paleta brand — terracota/cobre quente (hotelaria boutique)
        brand: {
          50: '#fbf5ee',
          100: '#f5e6d3',
          200: '#ecceaa',
          300: '#dfb07d',
          400: '#d18f57',
          500: '#c2733a',
          600: '#a85a2c',
          700: '#874528',
          800: '#6e3a25',
          900: '#5a3120',
          950: '#321810',
        },
        // Creme/areia — tons neutros quentes (substitui stone como neutro principal)
        sand: {
          50: '#fbf8f3',
          100: '#f5efe4',
          200: '#ebe1cd',
          300: '#dccbab',
          400: '#c8b083',
          500: '#b29464',
          600: '#9a7c52',
          700: '#7d6444',
          800: '#65523b',
          900: '#544432',
          950: '#2e251a',
        },
        // Dourado — acentos sutis (badges, glow, separadores)
        gold: {
          50: '#fdf9ed',
          100: '#faedc9',
          200: '#f4d98e',
          300: '#edbe52',
          400: '#e8a52e',
          500: '#d28518',
          600: '#b46514',
          700: '#904a14',
          800: '#773c17',
          900: '#653216',
        },
        // Aliases semânticos via CSS vars (light + dark)
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-elevated': 'rgb(var(--surface-elevated) / <alpha-value>)',
        'surface-sunken': 'rgb(var(--surface-sunken) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-soft': 'rgb(var(--ink-soft) / <alpha-value>)',
        'ink-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        'line-soft': 'rgb(var(--line-soft) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-display)', 'var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        serif: '-0.02em',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-up': 'slideUp 350ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 350ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slideInRight 280ms cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 1.6s linear infinite',
        'glow-pulse': 'glowPulse 2.4s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgb(232 165 46 / 0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgb(232 165 46 / 0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgb(60 40 20 / 0.04), 0 2px 8px rgb(60 40 20 / 0.06)',
        hover: '0 6px 16px -4px rgb(60 40 20 / 0.10), 0 4px 8px -4px rgb(60 40 20 / 0.06)',
        elevated: '0 12px 24px -8px rgb(60 40 20 / 0.14), 0 4px 8px -4px rgb(60 40 20 / 0.08)',
        modal: '0 32px 64px -16px rgb(40 25 12 / 0.30), 0 0 0 1px rgb(40 25 12 / 0.06)',
        'inner-soft': 'inset 0 1px 2px rgb(60 40 20 / 0.06)',
        glow: '0 0 0 4px rgb(210 133 24 / 0.12), 0 4px 16px -4px rgb(210 133 24 / 0.30)',
      },
      backgroundImage: {
        'gradient-warm': 'linear-gradient(135deg, rgb(251 248 243) 0%, rgb(245 239 228) 100%)',
        'gradient-brand': 'linear-gradient(135deg, rgb(210 143 87) 0%, rgb(168 90 44) 100%)',
        'gradient-gold': 'linear-gradient(135deg, rgb(237 190 82) 0%, rgb(210 133 24) 100%)',
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")",
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
export default config;
