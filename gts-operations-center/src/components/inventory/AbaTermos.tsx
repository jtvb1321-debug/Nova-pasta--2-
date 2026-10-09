'use client'

import { useState } from 'react'
import { BarChart3, ClipboardCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TermosEstoqueTab } from './TermosEstoqueTab'
import {
  BarraBusca, Carregando, Contadores, ErroCarregar, SeletorPeriodo, TabelaRelatorio, qtd, usePainelEstoque, type PeriodoEstoque,
} from './PainelEstoque'

// Termos GTSNET: contadores, busca com bipagem (o serial mostra em quais termos o equipamento
// passou) e relatorio por equipe; o controle dos termos e' a tela que ja existia.
export function AbaTermos() {
  const [visao, setVisao] = useState<'controle' | 'relatorio'>('controle')
  const [periodo, setPeriodo] = useState<PeriodoEstoque>('mes')
  const [busca, setBusca] = useState('')

  const painel = usePainelEstoque<any>('termos', periodo)
  const c = painel.data?.contadores
  const prazo = painel.data?.prazoTermoDias ?? 7

  return (
    <div className="space-y-4">
      <Contadores
        carregando={painel.isLoading}
        itens={[
          { id: 'abertos', rotulo: 'Termos em aberto', valor: qtd(c?.abertos), tom: 'alerta' },
          { id: 'parados', rotulo: `Parados (+${prazo} dias)`, valor: qtd(c?.parados), tom: (c?.parados ?? 0) > 0 ? 'perigo' : 'neutro' },
          { id: 'pendentes', rotulo: 'Unidades pendentes', valor: qtd(c?.unidadesPendentes), detalhe: 'nos termos em aberto' },
          { id: 'conferidos', rotulo: 'Conferidos', valor: qtd(c?.conferidosPeriodo), tom: 'ok', detalhe: 'no período do relatório' },
        ]}
      />

      <BarraBusca
        id="termos-busca"
        valor={busca}
        onMudar={setBusca}
        onAplicar={() => { /* o texto so serve para bipar: a ficha mostra os termos do equipamento */ }}
        placeholder="Bipe o serial/MAC para ver em quais termos o equipamento passou"
        visoes={[{ id: 'controle', rotulo: `Controle${c?.abertos ? ` (${c.abertos})` : ''}`, icone: ClipboardCheck }, { id: 'relatorio', rotulo: 'Relatório', icone: BarChart3 }]}
        visao={visao}
        onVisao={setVisao}
      />

      {visao === 'controle' ? <TermosEstoqueTab /> : (
        <div className="space-y-3">
          <SeletorPeriodo valor={periodo} onMudar={setPeriodo} />
          {painel.isError ? <ErroCarregar mensagem="Não foi possível carregar o relatório." onTentar={() => painel.refetch()} />
            : painel.isLoading ? <Carregando /> : (
              <TabelaRelatorio
                titulo="Termos abertos no período, por equipe"
                linhas={painel.data?.relatorio?.porEquipe ?? []}
                chave={l => l.equipeId}
                colunas={[
                  { titulo: 'Equipe', valor: (l: any) => <span className="font-medium text-tema-tinta">{l.equipe}</span> },
                  { titulo: 'Termos', direita: true, valor: (l: any) => qtd(l.termos) },
                  { titulo: 'Retirado', direita: true, valor: (l: any) => qtd(l.retirado) },
                  { titulo: 'Usado', direita: true, valor: (l: any) => qtd(l.usado) },
                  { titulo: 'Devolvido', direita: true, valor: (l: any) => qtd(l.devolvido) },
                  { titulo: 'Transferido', direita: true, valor: (l: any) => qtd(l.transferido) },
                  { titulo: 'Divergente', direita: true, valor: (l: any) => <span className={cn(l.divergente > 0 && 'text-red-700 font-bold')}>{qtd(l.divergente)}</span> },
                  { titulo: 'Pendente', direita: true, valor: (l: any) => <span className={cn(l.pendente > 0 && 'text-amber-700 font-semibold')}>{qtd(l.pendente)}</span> },
                ]}
              />
            )}
        </div>
      )}
    </div>
  )
}
