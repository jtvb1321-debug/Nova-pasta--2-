'use client'

// Fundo tecnologico do Painel de TV: grid sutil + glow + particulas leves em
// CSS puro (sem canvas/libs externas, para nao pesar numa TV ligada 24/7).
const PARTICULAS = Array.from({ length: 18 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  top: `${(i * 53) % 100}%`,
  delay: `${(i % 9) * 1.1}s`,
  duracao: `${14 + (i % 6) * 3}s`,
  tamanho: i % 3 === 0 ? 3 : 2,
}))

export function MissionControlBackground() {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      {/* Grid tecnologico */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Glow radial nos cantos */}
      <div className="absolute -top-40 -left-40 w-[36rem] h-[36rem] rounded-full bg-blue-600/10 blur-3xl" />
      <div className="absolute -bottom-40 -right-40 w-[36rem] h-[36rem] rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute top-1/3 right-1/4 w-80 h-80 rounded-full bg-orange-500/5 blur-3xl" />

      {/* Particulas flutuantes */}
      {PARTICULAS.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-blue-300/40"
          style={{
            left: p.left,
            top: p.top,
            width: p.tamanho,
            height: p.tamanho,
            animation: `mc-particula ${p.duracao} ease-in-out infinite`,
            animationDelay: p.delay,
          }}
        />
      ))}

      <style>{`
        @keyframes mc-particula {
          0%, 100% { transform: translate(0, 0); opacity: 0.15; }
          50% { transform: translate(18px, -26px); opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}
