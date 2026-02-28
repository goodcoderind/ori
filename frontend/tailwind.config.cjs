/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Sophisticated dark theme - Apple Pro / Notion style
        background: '#0F0F14',
        surface: '#151520',
        surfaceRaised: '#1C1C28',
        borderSubtle: 'rgba(156, 124, 255, 0.1)',
        
        // Text colors
        textPrimary: '#F8FAFC',
        textMuted: 'rgba(248, 250, 252, 0.65)',
        textFaint: 'rgba(248, 250, 252, 0.35)',
        
        // Premium accent colors
        accentPrimary: '#9C7CFF',
        accentSecondary: '#BFA8FF',
        accentHighlight: '#6EE7F9',
        
        // Legacy aliases for compatibility
        accentIndigo: '#9C7CFF',
        accentTeal: '#6EE7F9',
        accentAmber: '#BFA8FF',
        accentPurple: '#9C7CFF',
        accentViolet: '#9C7CFF',
        accentBlue: '#6EE7F9',
        accentMint: '#6EE7F9',
        accentRed: '#EF4444',
        
        // Bento grid cell colors
        bento1: 'rgba(156, 124, 255, 0.1)',
        bento2: 'rgba(191, 168, 255, 0.1)',
        bento3: 'rgba(110, 231, 249, 0.1)',
        bento4: 'rgba(156, 124, 255, 0.08)',
        bento5: 'rgba(191, 168, 255, 0.08)',
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
