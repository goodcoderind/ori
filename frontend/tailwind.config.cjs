/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#09090F',
        surface: '#111119',
        surfaceRaised: '#1A1A26',
        borderSubtle: '#26263A',
        accentViolet: '#7C6EF5',
        accentAmber: '#F0A55A',
        accentMint: '#52C99A',
        accentRed: '#E06060',
        accentBlue: '#5BA3F5',
        textPrimary: '#EEEDF8',
        textMuted: '#8A89A4',
        textFaint: '#3E3D56'
      },
      fontFamily: {
        serifDisplay: ['"Instrument Serif"', 'serif'],
        sansUi: ['"DM Sans"', 'system-ui', 'sans-serif'],
        monoData: ['"JetBrains Mono"', 'monospace']
      },
      boxShadow: {
        card: '0 18px 45px rgba(0,0,0,0.45)'
      }
    }
  },
  plugins: []
};

