'use client'

import { useMemo, useState } from 'react'
import { BarChart3, UserCog, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PorTecnicoTab } from './PorTecnicoTab'
import {
  AlertaPrazo, BarraBusca, CabecalhoAba, Carregando, Contadores, ErroCarregar, TabelaRelatorio, brl, qtd, usePainelEstoque,
} from './PainelEstoque'

// Por tecnico: visao geral de todas as equipes (material no carro, equipamentos, extraviados,
// termos parados) + a tela de cada equipe (carregar, baixar, MAC), que ja existia.
type Filtro = '' | 'material' | 'extraviados' | 'parados'

export function AbaPorTecnico() {
  const [visao, setVisao] = useState<'geral' | 'equipe'>('geral')
  const [equipe, setEquipe] = useState<string | undefined>(undefined)
  const [filtro, setFiltro] = useState<Filtro>('')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')

  const painel = usePainelEstoque<any>('por-tecnico')
  const c = painel.data?.contadores
  const prazo = painel.data?.prazoTermoDias ?? 7

  const equipes = useMemo(() => {
    const b = buscaAplicada.toLowerCase()
    return ((painel.data?.equipes ?? []) as any[])
      .filter(e => !b || e.equipe.toLowerCase().includes(b))
      .filter(e => filtro === '' || (filtro === 'material' && (e.quantidade > 0 || e.equipamentos > 0)) || (filtro === 'extraviados' && e.extraviados > 0) || (filtro === 'parados' && e.termosParados > 0))
  }, [painel.data, buscaAplicada, filtro])

  function abrirEquipe(id: string) {
    setEquipe(id)
    setVisao('equipe')
  }

  return (
    <div className="space-y-4">
      <CabecalhoAba icone={UserCog} titulo="Por técnico" descricao="Material e equipamentos no carro de cada equipe. Abra uma equipe para carregar, dar baixa ou registrar por MAC." />

      {(c?.termosParados ?? 0) > 0 && (
        <AlertaPrazo texto={`${c.termosParados} termo(s) de retirada parados há mais de ${prazo} dias. Confira o carro dessas equipes.`} onClick={() => { setFiltro('parados'); setVisao('geral') }} />
      )}

      <Contadores
        carregando={painel.isLoading}
        ativo={filtro}
        onEscolher={id => { if (id === 'valor' || id === 'equipamentos') return; setFiltro(filtro === id ? '' : id as Filtro); setVisao('geral') }}
        itens={[
          { id: 'material', rotulo: 'Equipes com material', valor: qtd(c?.equipesComMaterial) },
          { id: 'equipamentos', rotulo: 'Equipamentos com técnicos', valor: qtd(c?.equipamentosComTecnicos), tom: 'info' },
          { id: 'extraviados', rotulo: 'Extraviados', valor: qtd(c?.extraviados), tom: (c?.extraviados ?? 0) > 0 ? 'perigo' : 'neutro' },
          { id: 'parados', rotulo: `Termos parados (+${prazo} dias)`, valor: qtd(c?.termosParados), tom: (c?.termosParados ?? 0) > 0 ? 'perigo' : 'neutro' },
          { id: 'valor', rotulo: 'Valor nos carros', valor: c ? brl(c.valorNosCarros) : '—' },
        ]}
      />

      <BarraBusca
        id="tec-busca"
        valor={busca}
        onMudar={setBusca}
        onAplicar={setBuscaAplicada}
        placeholder="Bipe o serial/MAC ou busque a equipe"
        visoes={[{ id: 'geral', rotulo: 'Visão geral', icone: BarChart3 }, { id: 'equipe', rotulo: 'Por equipe', icone: Users }]}
        visao={visao}
        onVisao={setVisao}
        temFiltro={!!(buscaAplicada || filtro)}
        onLimpar={() => { setBusca(''); setBuscaAplicada(''); setFiltro('') }}
      />

      {visao === 'equipe' ? (
        <PorTecnicoTab key={equipe ?? 'nenhuma'} equipeInicial={equipe} />
      ) : painel.isError ? <ErroCarregar mensagem="Não foi possível carregar a visão geral." onTentar={() => painel.refetch()} />
        : painel.isLoading ? <Carregando /> : (
          <TabelaRelatorio
            titulo="Material por equipe (clique para abrir)"
            vazio="Nenhuma equipe com esses filtros."
            linhas={equipes}
            chave={l => l.equipeId}
            colunas={[
              { titulo: 'Equipe', valor: (l: any) => <button type="button" onClick={() => abrirEquipe(l.equipeId)} className="font-medium text-blue-700 hover:underline text-left">{l.equipe}</button> },
              { titulo: 'Produtos', direita: true, valor: (l: any) => qtd(l.itens) },
              { titulo: 'Unidades', direita: true, valor: (l: any) => qtd(l.quantidade) },
              { titulo: 'Valor', direita: true, valor: (l: any) => brl(l.valor) },
              { titulo: 'Equipamentos', direita: true, valor: (l: any) => qtd(l.equipamentos) },
              { titulo: 'Extraviados', direita: true, valor: (l: any) => <span className={cn(l.extraviados > 0 && 'text-red-700 font-bold')}>{qtd(l.extraviados)}</span> },
              { titulo: 'Termos parados', direita: true, valor: (l: any) => <span className={cn(l.termosParados > 0 && 'text-red-700 font-bold')}>{qtd(l.termosParados)}</span> },
            ]}
          />
        )}
    </div>
  )
}
