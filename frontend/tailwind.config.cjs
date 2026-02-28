/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Professional dark theme with indigo/teal accents
        background: '#0F0F23',
        surface: '#1A1A2E',
        surfaceRaised: '#16213E',
        borderSubtle: 'rgba(99, 102, 241, 0.1)',
        
        // Text colors
        textPrimary: '#F8FAFC',
        textMuted: 'rgba(248, 250, 252, 0.7)',
        textFaint: 'rgba(248, 250, 252, 0.4)',
        
        // Professional accent colors
        accentIndigo: '#6366F1',
        accentTeal: '#14B8A6',
        accentAmber: '#F59E0B',
        accentPurple: '#8B5CF6',
        accentBlue: '#3B82F6',
        accentMint: '#10B981',
        accentRed: '#EF4444',
        
        // Bento grid cell colors
        bento1: 'rgba(99, 102, 241, 0.1)',
        bento2: 'rgba(20, 184, 166, 0.1)',
        bento3: 'rgba(139, 92, 246, 0.1)',
        bento4: 'rgba(59, 130, 246, 0.1)',
        bento5: 'rgba(16, 185, 129, 0.1)',
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
