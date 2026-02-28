/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ori: {
          amber: '#F59E0B',
          amberLight: 'rgba(245, 158, 11, 0.15)',
          amberSubtle: 'rgba(245, 158, 11, 0.06)',
          green: '#10B981',
          greenGlow: 'rgba(16, 185, 129, 0.5)',
          gray: '#6B7280',
        },
        panel: {
          bg: 'rgba(12, 12, 14, 0.92)',
          pill: 'rgba(15, 15, 15, 0.85)',
          border: 'rgba(255, 255, 255, 0.07)',
          borderLight: 'rgba(255, 255, 255, 0.05)',
          text: 'rgba(255, 255, 255, 0.85)',
          textMuted: 'rgba(255, 255, 255, 0.55)',
          textDim: 'rgba(255, 255, 255, 0.3)',
          textGhost: 'rgba(255, 255, 255, 0.25)',
          surface: 'rgba(255, 255, 255, 0.04)',
          surfaceHover: 'rgba(255, 255, 255, 0.06)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        panel: '20px',
        pill: '100px',
        card: '14px',
        input: '12px',
        button: '10px',
      },
      boxShadow: {
        panel: '0 24px 64px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset, 0 -1px 0 rgba(0,0,0,0.3) inset',
        pill: '0 8px 32px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.05) inset',
        amberGlow: '0 0 8px rgba(245, 158, 11, 0.6)',
        greenGlow: '0 0 8px rgba(16, 185, 129, 0.5)',
      },
      backdropBlur: {
        panel: '24px',
        pill: '20px',
      },
    },
  },
  plugins: [],
}
