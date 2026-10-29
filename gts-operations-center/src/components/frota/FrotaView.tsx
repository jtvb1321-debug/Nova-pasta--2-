'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ViaturasTab } from './ViaturasTab'
import { HistoricoTab } from './HistoricoTab'
import { ItensExigidosTab } from './ItensExigidosTab'
import { RevisoesTab } from './RevisoesTab'

// Frota (so administrador): viaturas (tela inicial), historico de vistorias, revisoes (servicos e notas fiscais) e itens exigidos.

type Aba = 'viaturas' | 'historico' | 'revisoes' | 'itens'

export function FrotaView({ podeAdministrar }: { podeAdministrar: boolean }) {
  const [aba, setAba] = useState<Aba>('viaturas')
  const [veiculoHistorico, setVeiculoHistorico] = useState<string | undefined>()
  const [veiculoRevisoes, setVeiculoRevisoes] = useState<string | undefined>()

  const abas: { id: Aba; rotulo: string }[] = [
    { id: 'viaturas', rotulo: 'Viaturas' },
    { id: 'historico', rotulo: 'Histórico' },
    { id: 'revisoes', rotulo: 'Revisões' },
    ...(podeAdministrar ? [{ id: 'itens' as Aba, rotulo: 'Itens exigidos' }] : []),
  ]

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-tema-tinta">Frota</h1>
        <p className="text-sm text-tema-suave">Cadastro, vistoria semanal e revisões das viaturas da GTSNET.</p>
      </header>
      <div role="tablist" aria-label="Seções da frota" className="flex gap-1 overflow-x-auto border-b border-tema-linha">
        {abas.map(a => (
          <button key={a.id} id={`aba-${a.id}`} role="tab" type="button" aria-selected={aba === a.id} aria-controls={`painel-${a.id}`} onClick={() => setAba(a.id)}
            className={cn('-mb-px min-h-[44px] whitespace-nowrap border-b-2 px-4 text-sm font-semibold transition-colors', aba === a.id ? 'border-orange-500 text-orange-700' : 'border-transparent text-tema-suave hover:text-tema-tinta')}>{a.rotulo}</button>
        ))}
      </div>
      <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`}>
        {aba === 'viaturas' && <ViaturasTab onHistorico={id => { setVeiculoHistorico(id); setAba('historico') }} onRevisoes={id => { setVeiculoRevisoes(id); setAba('revisoes') }} />}
        {aba === 'historico' && <HistoricoTab key={veiculoHistorico ?? 'todas'} veiculoInicial={veiculoHistorico} />}
        {aba === 'revisoes' && <RevisoesTab key={veiculoRevisoes ?? 'todas'} veiculoInicial={veiculoRevisoes} />}
        {aba === 'itens' && podeAdministrar && <ItensExigidosTab />}
      </div>
    </div>
  )
}
