/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary':   '#0D1117',
        'bg-secondary': '#161B22',
        'bg-tertiary':  '#1C2333',
        'border':       '#21262D',
        'border-muted': '#30363D',
        'text-primary': '#E6EDF3',
        'text-secondary':'#C9D1D9',
        'text-muted':   '#8B949E',
        'accent-blue':  '#58A6FF',
        'accent-green': '#3FB950',
        'accent-red':   '#F85149',
        'accent-gold':  '#E3B341',
      },
      fontFamily: {
        sans: ['Noto Sans KR', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
