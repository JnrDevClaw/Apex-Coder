/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        // Nested colors (accessed as bg-primary, bg-secondary, etc.)
        bg: {
          primary: '#0A0A0C',
          secondary: '#101218',
          panel: '#0F1217',
        },
        accent: {
          primary: '#3AB8FF',
          secondary: '#A46BFF',
        },
        text: {
          primary: '#E5E7EB',
          secondary: '#9CA3AF',
        },
        // Flat colors for direct access
        success: '#7BFFB2',
        error: '#FF4C88',
      },
      fontFamily: {
        display: ['Inter Tight', 'Sora', 'sans-serif'],
        body: ['Inter', 'Geist', 'sans-serif'],
        code: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        neon: '0 0 12px rgba(58,184,255,0.45)',
        neonSoft: '0 0 6px rgba(58,184,255,0.25)',
      },
      animation: {
        pulseSoft: 'pulseSoft 2s ease-in-out infinite',
        shimmer: 'shimmer 2.5s linear infinite',
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 6px var(--accent-primary)' },
          '50%': { opacity: '0.7', boxShadow: '0 0 12px var(--accent-primary)' },
        },
      },
    },
  },
}