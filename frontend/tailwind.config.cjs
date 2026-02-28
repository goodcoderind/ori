/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Poppy Modern AI Palette - Dark Neutral Base
        background: '#0B1220',
        surface: '#111827',
        surfaceRaised: '#141B2D',
        borderSubtle: 'rgba(97, 165, 250, 0.2)',
        
        // Text colors
        textPrimary: '#F1F5F9',
        textMuted: '#94A3B8',
        textFaint: '#64748B',
        
        // Core Accent Family (Blue)
        accentPrimary: '#61A5FA',
        accentHover: '#3B82F6',
        accentDeep: '#1D4ED8',
        accentGlow: 'rgba(97, 165, 250, 0.35)',
        
        // Differentiated Accents
        accentPurple: '#A78BFA',
        accentTeal: '#2DD4BF',
        accentYellow: '#FBBF24',
        accentYellowBright: '#FACC15',
        
        // Legacy aliases for compatibility
        accentIndigo: '#61A5FA',
        accentAmber: '#FBBF24',
        accentViolet: '#A78BFA',
        accentBlue: '#61A5FA',
        accentMint: '#2DD4BF',
        accentRed: '#EF4444',
      },
      fontFamily: {
        serifDisplay: ['"Instrument Serif"', 'serif'],
        sansUi: ['"DM Sans"', 'system-ui', 'sans-serif'],
        monoData: ['"JetBrains Mono"', 'monospace']
      },
      boxShadow: {
        card: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        bento: '0 4px 20px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      }
    }
  },
  plugins: []
};
