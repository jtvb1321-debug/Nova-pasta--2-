import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

// Moldura enxuta da vistoria (sem menu lateral): feita para o celular, igual para todos os perfis.
export function VistoriaShell({ voltarPara, rotuloVoltar, children }: { voltarPara: string; rotuloVoltar: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-tema-fundo">
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-tema-linha bg-tema-superficie px-2 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]">
        <Link href={voltarPara} className="flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-semibold text-tema-suave hover:text-tema-tinta" aria-label={`Voltar: ${rotuloVoltar}`}>
          <ChevronLeft className="h-5 w-5" aria-hidden /> <span className="hidden sm:inline">{rotuloVoltar}</span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 pr-10 sm:justify-start sm:pr-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/orbia-simbolo.svg" alt="" aria-hidden className="h-7 w-7 object-contain" />
          <p className="truncate text-base font-extrabold text-tema-tinta" style={{ letterSpacing: '-0.02em' }}>Orbi<span className="text-orange-500">a</span> <span className="font-semibold text-tema-suave">· Vistoria da viatura</span></p>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
