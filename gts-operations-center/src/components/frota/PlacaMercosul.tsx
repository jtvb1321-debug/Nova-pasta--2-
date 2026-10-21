import { cn } from '@/lib/utils'

// Placa no estilo Mercosul: faixa azul "BRASIL" e caracteres em preto sobre fundo branco.
export function PlacaMercosul({ placa, className }: { placa: string; className?: string }) {
  const texto = placa.length === 7 ? `${placa.slice(0, 3)}${placa.slice(3)}` : placa
  return (
    <span
      className={cn('inline-flex w-[128px] flex-col overflow-hidden rounded-md border-2 border-slate-800 bg-white text-center shadow-sm', className)}
      role="img" aria-label={`Placa ${placa}`}
    >
      <span className="flex items-center justify-between bg-blue-700 px-1.5 py-px text-[8px] font-bold leading-3 tracking-[0.2em] text-white" aria-hidden>
        <span>BRASIL</span><span aria-hidden>◼</span>
      </span>
      <span className="py-0.5 font-mono text-[22px] font-extrabold leading-7 tracking-[0.08em] text-slate-900" aria-hidden>{texto}</span>
    </span>
  )
}
