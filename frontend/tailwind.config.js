/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        /* ── Zentrix Space Palette ── */
        zx: {
          bg:       '#020208',
          void:     '#06060F',
          s1:       '#0C0C1A',
          s2:       '#121222',
          s3:       '#1A1A30',
          s4:       '#22203C',
          s5:       '#2C2950',
          border:   'rgba(255,255,255,0.06)',
          glass:    'rgba(255,255,255,0.03)',
          'glass-hover': 'rgba(255,255,255,0.06)',
        },
        /* ── Primary – Electric Violet ── */
        primary: {
          50:  '#F0EFFE',
          100: '#E0DEFE',
          200: '#C3BDFD',
          300: '#A69CFB',
          400: '#9186F4',
          500: '#7B6FF0',
          600: '#6355D4',
          700: '#4D41B0',
          800: '#372F8C',
          900: '#231E68',
          DEFAULT: '#7B6FF0',
        },
        /* ── Cyan Accent ── */
        cyan: {
          300: '#67E8F9',
          400: '#22D3EE',
          500: '#06B6D4',
          600: '#0891B2',
        },
        /* ── Secondary Accents ── */
        accent: {
          pink:  '#F472B6',
          teal:  '#2DD4BF',
          amber: '#FCD34D',
          coral: '#FB7185',
          lime:  '#A3E635',
        },
        /* ── Semantic ── */
        success: '#00D97E',
        error:   '#FF4757',
        warning: '#FFB020',
        rating:  '#FFD060',
        online:  '#00D97E',
      },

      fontFamily: {
        display: ['Syne', 'system-ui', 'sans-serif'],
        body:    ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
        /* Legacy compat */
        outfit:  ['Syne', 'sans-serif'],
        'dm-sans': ['Inter', 'sans-serif'],
      },

      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em' }],
        '4xl': ['2.25rem',  { lineHeight: '2.5rem',  letterSpacing: '-0.025em' }],
        '5xl': ['3rem',     { lineHeight: '1',        letterSpacing: '-0.03em' }],
        '6xl': ['3.75rem',  { lineHeight: '1',        letterSpacing: '-0.035em' }],
        '7xl': ['4.5rem',   { lineHeight: '1',        letterSpacing: '-0.04em' }],
      },

      backgroundImage: {
        /* Core gradients */
        'gradient-zx':     'linear-gradient(135deg, #1A1830 0%, #020208 60%, #120A20 100%)',
        'gradient-primary':'linear-gradient(135deg, #7B6FF0, #22D3EE)',
        'gradient-card':   'linear-gradient(to top, rgba(2,2,8,1) 0%, rgba(2,2,8,0.7) 50%, transparent 100%)',
        'gradient-hero-l': 'linear-gradient(to right, rgba(2,2,8,0.98) 0%, rgba(2,2,8,0.88) 35%, rgba(2,2,8,0.55) 65%, transparent 100%)',
        'gradient-hero-b': 'linear-gradient(to top, rgba(2,2,8,1) 0%, rgba(2,2,8,0.85) 20%, transparent 100%)',
        /* Aurora effect */
        'aurora-1': 'radial-gradient(ellipse at 20% 50%, rgba(123,111,240,0.18) 0%, transparent 60%)',
        'aurora-2': 'radial-gradient(ellipse at 80% 20%, rgba(34,211,238,0.12) 0%, transparent 55%)',
        'aurora-3': 'radial-gradient(ellipse at 60% 80%, rgba(244,114,182,0.08) 0%, transparent 50%)',
        /* Shimmer */
        'shimmer': 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0) 100%)',
        /* Noise (CSS approach) */
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
      },

      boxShadow: {
        'glow-sm':  '0 0 15px rgba(123,111,240,0.3)',
        'glow':     '0 0 30px rgba(123,111,240,0.4)',
        'glow-lg':  '0 0 60px rgba(123,111,240,0.35)',
        'glow-xl':  '0 0 100px rgba(123,111,240,0.25)',
        'glow-cyan':'0 0 30px rgba(34,211,238,0.35)',
        'glow-pink':'0 0 30px rgba(244,114,182,0.35)',
        'card':     '0 4px 24px rgba(0,0,0,0.7)',
        'card-hover':'0 20px 60px rgba(0,0,0,0.9), 0 0 0 1px rgba(123,111,240,0.25)',
        'nav':      '0 2px 40px rgba(0,0,0,0.8)',
        'cinematic':'0 30px 100px rgba(0,0,0,0.95)',
        'inner-top':'inset 0 1px 0 rgba(255,255,255,0.07)',
        'modal':    '0 25px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.05)',
      },

      animation: {
        'shimmer':       'shimmer 2.5s infinite linear',
        'float':         'float 6s ease-in-out infinite',
        'glow-pulse':    'glow-pulse 3s ease-in-out infinite',
        'aurora':        'aurora 12s ease-in-out infinite alternate',
        'slide-up':      'slide-up 0.5s cubic-bezier(0.16,1,0.3,1)',
        'slide-down':    'slide-down 0.4s cubic-bezier(0.16,1,0.3,1)',
        'slide-in-left': 'slide-in-left 0.5s cubic-bezier(0.16,1,0.3,1)',
        'slide-in-right':'slide-in-right 0.5s cubic-bezier(0.16,1,0.3,1)',
        'fade-in':       'fade-in 0.4s ease-out',
        'scale-in':      'scale-in 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        'spin-slow':     'spin 10s linear infinite',
        'bounce-subtle': 'bounce-subtle 0.7s ease-in-out',
        'gradient-shift':'gradient-shift 4s ease-in-out infinite alternate',
        'progress-bar':  'progress-bar 1.8s ease-in-out infinite',
        'reveal':        'reveal 0.6s cubic-bezier(0.16,1,0.3,1)',
        'dot-blink':     'dot-blink 1.4s ease-in-out infinite',
      },

      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '33%':      { transform: 'translateY(-10px) rotate(1deg)' },
          '66%':      { transform: 'translateY(-5px) rotate(-1deg)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.5', transform: 'scale(1)' },
          '50%':      { opacity: '1',   transform: 'scale(1.05)' },
        },
        aurora: {
          '0%':   { transform: 'translate(0%, 0%) scale(1)',   opacity: '0.6' },
          '33%':  { transform: 'translate(10%, -10%) scale(1.1)', opacity: '0.8' },
          '66%':  { transform: 'translate(-5%, 5%) scale(0.95)',  opacity: '0.5' },
          '100%': { transform: 'translate(5%, -5%) scale(1.05)', opacity: '0.7' },
        },
        'slide-up': {
          '0%':   { opacity: '0', transform: 'translateY(28px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%':   { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-left': {
          '0%':   { opacity: '0', transform: 'translateX(-28px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-right': {
          '0%':   { opacity: '0', transform: 'translateX(28px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.88)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'bounce-subtle': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%':      { transform: 'scale(1.18)' },
        },
        'gradient-shift': {
          '0%':   { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '100% 50%' },
        },
        'progress-bar': {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        reveal: {
          '0%':   { opacity: '0', transform: 'translateY(16px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'dot-blink': {
          '0%, 80%, 100%': { opacity: '0' },
          '40%':           { opacity: '1' },
        },
      },

      transitionTimingFunction: {
        'spring':    'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth':    'cubic-bezier(0.16, 1, 0.3, 1)',
        'snappy':    'cubic-bezier(0.2, 0, 0, 1)',
        'overshoot': 'cubic-bezier(0.34, 1.8, 0.64, 1)',
      },

      backdropBlur: {
        xs: '2px',
        sm: '6px',
        md: '12px',
        '2xl': '24px',
        '3xl': '40px',
        '4xl': '64px',
      },

      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },

      screens: {
        xs:  '390px',
        sm:  '640px',
        md:  '768px',
        lg:  '1024px',
        xl:  '1280px',
        '2xl': '1440px',
        '3xl': '1920px',
      },

      spacing: {
        /* Safe area tokens */
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
        'nav-h':       '64px',
        'bottom-nav-h':'68px',
        '18': '4.5rem',
        '22': '5.5rem',
        '26': '6.5rem',
        '30': '7.5rem',
      },

      zIndex: {
        'behind':     '-1',
        'base':       '0',
        'raised':     '10',
        'overlay':    '20',
        'modal':      '40',
        'nav':        '50',
        'tooltip':    '60',
        'live-player':'80',
        'toast':      '100',
        'max':        '1000',
      },
    },
  },
  plugins: [],
}
