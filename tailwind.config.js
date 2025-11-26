/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./static/**/*.{html,js}",
    "./templates/**/*.{html,js}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4A90E2',
        secondary: '#7ED9C3',
        accent: '#87CEEB',
        'bg-main': '#F0F8FF',
        'bg-secondary': '#E6F3F7',
        'text-primary': '#2C3E50',
        'text-secondary': '#5D6D7E',
        cream: '#F8FBFF',
        success: '#52C89F',
        error: '#E74C3C',
        warning: '#F39C12',
        'medical-blue-light': '#5DADE2',
        'medical-blue-dark': '#2874A6',
      },
      boxShadow: {
        soft: '0 2px 8px rgba(74, 144, 226, 0.15)',
        'tech-glow': '0 0 0 3px rgba(74, 144, 226, 0.6)',
      },
      borderRadius: {
        'xl-custom': '20px',
        '2xl-custom': '24px',
      },
      spacing: {
        'sidebar': '320px',
        'topbar': '90px',
        'composer': '80px',
      },
      backdropBlur: {
        'xs': '5px',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.25, 0.8, 0.25, 1)',
      },
      animation: {
        'parallax': 'parallax 60s infinite linear',
        'falling-leaf': 'falling-leaf 15s linear infinite',
        'loading-bounce': 'loading-bounce 1.5s ease-in-out infinite',
        'bubble-appear': 'bubbleAppear 0.5s ease forwards',
        'nurse-idle': 'nurse-idle 4s ease-in-out infinite',
        'recording-pulse': 'recording-pulse 1.2s infinite',
        'slide-in-right': 'slideInRight 0.4s ease',
        'listening-pulse': 'listening-pulse 1.4s ease-in-out infinite',
        'command-label-fade': 'commandLabelFade 2.3s ease forwards',
      },
      keyframes: {
        parallax: {
          '0%': { backgroundPosition: '0% 0%' },
          '100%': { backgroundPosition: '100% 100%' },
        },
        fallingLeaf: {
          '0%': { transform: 'translateY(-20px) rotate(0deg)', opacity: '0' },
          '10%': { opacity: '0.3' },
          '100%': { transform: 'translateY(100vh) rotate(360deg)', opacity: '0' },
        },
        loadingBounce: {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-20px) scale(1.05)' },
        },
        bubbleAppear: {
          from: { opacity: '0', transform: 'translateY(15px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        nurseIdle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        recordingPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255, 107, 107, 0.7)' },
          '50%': { boxShadow: '0 0 0 15px rgba(255, 107, 107, 0)' },
        },
        slideInRight: {
          from: { transform: 'translateX(100px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        listeningPulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.5' },
          '50%': { transform: 'scale(1.5)', opacity: '1' },
        },
        commandLabelFade: {
          '0%': { opacity: '0', transform: 'translateY(-10px) scale(0.9)' },
          '10%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '85%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-10px) scale(0.95)' },
        },
      },
    },
  },
  plugins: [],
}
