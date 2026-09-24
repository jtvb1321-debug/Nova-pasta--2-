import type { Config } from 'tailwindcss'
import { fontFamily } from 'tailwindcss/defaultTheme'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // Paleta GTS Operations Center
        gts: {
          bg: '#0B1120',
          card: '#111827',
          blue: '#2563EB',
          green: '#10B981',
          yellow: '#F59E0B',
          red: '#EF4444',
          gray: '#6B7280',
          // Sinal - segunda cor de destaque (dados de rede/telemetria ao vivo),
          // separada da laranja (marca/acao) para dar mais faixa cromatica
          // sem virar "arco-iris" - usar com moderacao.
          signal: '#22D3EE',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Cores neutras do sistema com versao clara e escura (tema claro/escuro).
        // Os valores do tema claro sao os mesmos hex usados antes em todo o
        // sistema; os do escuro ficam em globals.css (html.dark).
        tema: {
          tinta: 'rgb(var(--c-tinta) / <alpha-value>)', // #201D17 - titulos, texto forte
          texto: 'rgb(var(--c-texto) / <alpha-value>)', // #3F3A32 - texto corrido
          suave: 'rgb(var(--c-suave) / <alpha-value>)', // #7A7266 - texto secundario
          apagado: 'rgb(var(--c-apagado) / <alpha-value>)', // #A69E8F - texto terciario, datas
          linha: 'rgb(var(--c-linha) / <alpha-value>)', // #E6E1D6 - bordas
          'linha-forte': 'rgb(var(--c-linha-forte) / <alpha-value>)', // #D8D2C3 - bordas de campos
          fundo: 'rgb(var(--c-fundo) / <alpha-value>)', // #FAF9F6 - fundo das paginas
          'fundo-2': 'rgb(var(--c-fundo-2) / <alpha-value>)', // #FCFBF8 - fundo de campos
          superficie: 'rgb(var(--c-superficie) / <alpha-value>)', // branco - cartoes, menus, modais
          contraste: 'rgb(var(--c-contraste) / <alpha-value>)', // preto - sombras e realces leves
          'laranja-suave': 'rgb(var(--c-laranja-suave) / <alpha-value>)', // #FDEDDD
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', ...fontFamily.sans],
        mono: ['var(--font-mono-tech)', ...fontFamily.mono],
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-in-out',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideIn: {
          from: { transform: 'translateX(-10px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
