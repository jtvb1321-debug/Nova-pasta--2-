'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Search, RefreshCw, Users, UserCheck, UserX, Activity, CheckCircle2, CalendarOff,
  Phone, Briefcase, X, Clock, MapPin, Mail, ShieldCheck,
} from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { formatarHorasHM } from '@/lib/jornada'

type StatusHoje = 'INATIVO' | 'ATESTADO' | 'FALTA' | 'FOLGA' | 'EM_ATENDIMENTO' | 'DISPONIVEL' | 'SEM_INFO'

interface Tecnico {
  id: string
  nome: string
  cargo: string | null
  telefone: string | null
  avatar: string | null
  ativo: boolean
  equipe: { id: string; nome: string; status: string } | null
  usuario: { email: string; ativo: boolean; role: string } | null
  statusHoje: StatusHoje
  mesAtual: { dias: number; horasTrabalhadas: number; horasExtras: number; atestados: number; faltas: number; folgas: number }
}

async function fetchTecnicos(): Promise<{ data: Tecnico[] }> {
  const res = await fetch('/api/tecnicos')
  if (!res.ok) throw new Error('Erro ao buscar tecnicos')
  return res.json()
}

async function fetchEquipesComChamado() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

const STATUS_CFG: Record<StatusHoje, { label: string; cor: string; bg: string; dot: string }> = {
  INATIVO:         { label: 'Inativo',         cor: 'text-tema-suave',   bg: 'bg-tema-contraste/[0.03] border-tema-linha',      dot: 'bg-tema-apagado' },
  ATESTADO:        { label: 'Atestado',        cor: 'text-purple-700',  bg: 'bg-purple-500/10 border-purple-500/20', dot: 'bg-purple-500' },
  FALTA:           { label: 'Falta',           cor: 'text-red-700',     bg: 'bg-red-500/10 border-red-500/20',       dot: 'bg-red-500' },
  FOLGA:           { label: 'Folga',           cor: 'text-sky-700',     bg: 'bg-sky-500/10 border-sky-500/20',       dot: 'bg-sky-500' },
  EM_ATENDIMENTO:  { label: 'Em Atendimento',  cor: 'text-amber-700',   bg: 'bg-amber-500/10 border-amber-500/20',   dot: 'bg-amber-500 animate-pulse' },
  DISPONIVEL:      { label: 'Disponivel',      cor: 'text-emerald-700', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-500' },
  SEM_INFO:        { label: 'Sem informacao',  cor: 'text-tema-apagado',   bg: 'bg-tema-contraste/[0.03] border-tema-linha',      dot: 'bg-tema-apagado' },
}

const STATUS_FILTRO_OPTIONS: { valor: string; label: string }[] = [
  { valor: '', label: 'Todos os status' },
  { valor: 'DISPONIVEL', label: 'Disponivel' },
  { valor: 'EM_ATENDIMENTO', label: 'Em Atendimento' },
  { valor: 'ATESTADO', label: 'Atestado' },
  { valor: 'FALTA', label: 'Falta' },
  { valor: 'FOLGA', label: 'Folga' },
  { valor: 'INATIVO', label: 'Inativo' },
]

function Avatar({ tecnico, tamanho = 'md' }: { tecnico: Tecnico; tamanho?: 'md' | 'lg' }) {
  const dimensao = tamanho === 'lg' ? 'w-16 h-16 text-lg' : 'w-11 h-11 text-sm'
  if (tecnico.avatar) {
    return <img src={tecnico.avatar} alt={tecnico.nome} className={cn('rounded-full object-cover flex-shrink-0', dimensao)} />
  }
  return (
    <div className={cn('rounded-full bg-orange-500/15 text-orange-600 font-bold flex items-center justify-center flex-shrink-0', dimensao)}>
      {getInitials(tecnico.nome)}
    </div>
  )
}

export function TecnicosView() {
  const [busca, setBusca] = useState('')
  const [equipeFiltro, setEquipeFiltro] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('')
  const [tecnicoSelecionado, setTecnicoSelecionado] = useState<Tecnico | null>(null)

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['tecnicos'],
    queryFn: fetchTecnicos,
    refetchInterval: 30000,
  })

  const { data: equipesComChamado = [] } = useQuery({
    queryKey: ['teams-tecnicos-view'],
    queryFn: fetchEquipesComChamado,
  })

  const tecnicos = data?.data ?? []

  const equipesUnicas = Array.from(
    new Map(tecnicos.filter(t => t.equipe).map(t => [t.equipe!.id, t.equipe!.nome])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]))

  const buscaNormalizada = busca.trim().toLowerCase()
  const tecnicosFiltrados = tecnicos.filter(t => {
    if (equipeFiltro && t.equipe?.id !== equipeFiltro) return false
    if (statusFiltro && t.statusHoje !== statusFiltro) return false
    if (buscaNormalizada) {
      const alvo = `${t.nome} ${t.cargo || ''} ${t.equipe?.nome || ''}`.toLowerCase()
      if (!alvo.includes(buscaNormalizada)) return false
    }
    return true
  })

  const totais = {
    total: tecnicos.length,
    ativos: tecnicos.filter(t => t.ativo).length,
    inativos: tecnicos.filter(t => !t.ativo).length,
    emAtendimento: tecnicos.filter(t => t.statusHoje === 'EM_ATENDIMENTO').length,
    disponiveis: tecnicos.filter(t => t.statusHoje === 'DISPONIVEL').length,
    afastados: tecnicos.filter(t => ['ATESTADO', 'FALTA', 'FOLGA'].includes(t.statusHoje)).length,
  }

  const chamadoDaEquipe = (equipeId: string | undefined) => {
    if (!equipeId) return null
    const eq = equipesComChamado.find((e: any) => e.id === equipeId)
    return eq?.chamados?.[0] || null
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-tema-tinta">Gestao de Tecnicos</h1>
          <p className="text-tema-apagado text-sm mt-1">Visao geral da equipe de campo - status, equipe e horas do mes</p>
        </div>
        <button onClick={() => refetch()} className="gts-btn-secondary" disabled={isFetching}>
          <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total', valor: totais.total, icon: Users, cor: 'text-tema-tinta' },
          { label: 'Ativos', valor: totais.ativos, icon: UserCheck, cor: 'text-emerald-700' },
          { label: 'Inativos', valor: totais.inativos, icon: UserX, cor: 'text-tema-suave' },
          { label: 'Em Atendimento', valor: totais.emAtendimento, icon: Activity, cor: 'text-amber-700' },
          { label: 'Disponiveis', valor: totais.disponiveis, icon: CheckCircle2, cor: 'text-emerald-700' },
          { label: 'Afastados', valor: totais.afastados, icon: CalendarOff, cor: 'text-purple-700' },
        ].map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="gts-card">
              <p className="text-xs text-tema-apagado flex items-center gap-1"><Icon className="w-3.5 h-3.5" /> {card.label}</p>
              <p className={cn('text-2xl font-black mt-1', card.cor)}>{card.valor}</p>
            </div>
          )
        })}
      </div>

      {/* Busca e filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-tema-apagado absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, cargo ou equipe..."
            className="gts-input pl-9 w-full"
          />
        </div>
        <select value={equipeFiltro} onChange={e => setEquipeFiltro(e.target.value)} className="gts-input py-2 text-sm w-auto">
          <option value="">Todas as equipes</option>
          {equipesUnicas.map(([id, nome]) => (
            <option key={id} value={id}>{nome}</option>
          ))}
        </select>
        <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} className="gts-input py-2 text-sm w-auto">
          {STATUS_FILTRO_OPTIONS.map(s => (
            <option key={s.valor} value={s.valor}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-40 skeleton rounded-xl" />)}
        </div>
      ) : isError ? (
        <div className="gts-card text-center py-16">
          <UserX className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="text-tema-suave font-medium">Erro ao carregar tecnicos</p>
          <button onClick={() => refetch()} className="gts-btn-secondary mt-4 mx-auto">Tentar novamente</button>
        </div>
      ) : tecnicos.length === 0 ? (
        <div className="gts-card text-center py-16">
          <Users className="w-10 h-10 text-tema-apagado mx-auto mb-3" />
          <p className="text-tema-suave font-medium">Nenhum tecnico cadastrado</p>
        </div>
      ) : tecnicosFiltrados.length === 0 ? (
        <div className="gts-card text-center py-16">
          <Search className="w-10 h-10 text-tema-apagado mx-auto mb-3" />
          <p className="text-tema-suave font-medium">Nenhum tecnico encontrado para esses filtros</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tecnicosFiltrados.map(t => {
            const cfg = STATUS_CFG[t.statusHoje]
            return (
              <button
                key={t.id}
                onClick={() => setTecnicoSelecionado(t)}
                className="gts-card text-left hover:border-orange-600/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <Avatar tecnico={t} />
                  <div className="min-w-0 flex-1">
                    <p className="text-tema-tinta font-semibold truncate">{t.nome}</p>
                    <p className="text-xs text-tema-apagado truncate">{t.cargo || 'Cargo nao informado'}</p>
                    <p className="text-xs text-orange-600 truncate mt-0.5">{t.equipe?.nome || 'Sem equipe'}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className={cn('flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-full border', cfg.cor, cfg.bg)}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                    {cfg.label}
                  </span>
                  {t.telefone && (
                    <span className="flex items-center gap-1 text-xs text-tema-apagado">
                      <Phone className="w-3 h-3" /> {t.telefone}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-tema-linha text-xs text-tema-suave">
                  <span>{formatarHorasHM(t.mesAtual.horasTrabalhadas)} <span className="text-tema-apagado">este mes</span></span>
                  {t.mesAtual.horasExtras > 0 && (
                    <span className="text-amber-700 font-bold">{formatarHorasHM(t.mesAtual.horasExtras)} extras</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {tecnicoSelecionado && (
        <DetalheTecnicoModal
          tecnico={tecnicoSelecionado}
          chamadoAtivo={chamadoDaEquipe(tecnicoSelecionado.equipe?.id)}
          onClose={() => setTecnicoSelecionado(null)}
        />
      )}
    </div>
  )
}

function DetalheTecnicoModal({ tecnico, chamadoAtivo, onClose }: { tecnico: Tecnico; chamadoAtivo: any; onClose: () => void }) {
  const cfg = STATUS_CFG[tecnico.statusHoje]
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-tema-superficie border border-tema-linha rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between p-5 pb-4 border-b border-tema-linha sticky top-0 bg-tema-superficie">
          <div className="flex items-center gap-3">
            <Avatar tecnico={tecnico} tamanho="lg" />
            <div>
              <h3 className="text-lg font-semibold text-tema-tinta">{tecnico.nome}</h3>
              <span className={cn('flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full border mt-1 w-fit', cfg.cor, cfg.bg)}>
                <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                {cfg.label}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-tema-suave hover:text-tema-tinta flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <h4 className="text-xs font-semibold text-tema-apagado uppercase mb-2">Informacoes Pessoais</h4>
            <div className="space-y-1.5 text-sm">
              <p className="flex items-center gap-2 text-tema-texto"><Phone className="w-3.5 h-3.5 text-tema-apagado" /> {tecnico.telefone || 'Telefone nao informado'}</p>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-tema-apagado uppercase mb-2">Informacoes Profissionais</h4>
            <div className="space-y-1.5 text-sm">
              <p className="flex items-center gap-2 text-tema-texto"><Briefcase className="w-3.5 h-3.5 text-tema-apagado" /> {tecnico.cargo || 'Cargo nao informado'}</p>
              <p className="flex items-center gap-2 text-tema-texto"><Users className="w-3.5 h-3.5 text-tema-apagado" /> {tecnico.equipe?.nome || 'Sem equipe'}</p>
              {tecnico.usuario ? (
                <p className="flex items-center gap-2 text-tema-texto">
                  <Mail className="w-3.5 h-3.5 text-tema-apagado" /> {tecnico.usuario.email}
                  <span className={cn('text-xs px-1.5 py-0.5 rounded font-bold', tecnico.usuario.ativo ? 'text-emerald-700 bg-emerald-500/10' : 'text-red-700 bg-red-500/10')}>
                    {tecnico.usuario.ativo ? 'login ativo' : 'login inativo'}
                  </span>
                </p>
              ) : (
                <p className="flex items-center gap-2 text-tema-apagado"><ShieldCheck className="w-3.5 h-3.5" /> Sem conta de login vinculada</p>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-tema-apagado uppercase mb-2">Informacoes Operacionais do Mes</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-tema-contraste/[0.02] rounded-lg p-3">
                <p className="text-lg font-black text-tema-tinta">{formatarHorasHM(tecnico.mesAtual.horasTrabalhadas)}</p>
                <p className="text-xs text-tema-apagado">Horas trabalhadas ({tecnico.mesAtual.dias} dia(s))</p>
              </div>
              <div className="bg-tema-contraste/[0.02] rounded-lg p-3">
                <p className="text-lg font-black text-amber-700">{formatarHorasHM(tecnico.mesAtual.horasExtras)}</p>
                <p className="text-xs text-tema-apagado">Horas extras</p>
              </div>
              {(tecnico.mesAtual.atestados > 0 || tecnico.mesAtual.faltas > 0 || tecnico.mesAtual.folgas > 0) && (
                <div className="col-span-2 flex items-center gap-4 text-xs text-tema-suave pt-1">
                  {tecnico.mesAtual.atestados > 0 && <span className="text-purple-700">{tecnico.mesAtual.atestados} atestado(s)</span>}
                  {tecnico.mesAtual.faltas > 0 && <span className="text-red-700">{tecnico.mesAtual.faltas} falta(s)</span>}
                  {tecnico.mesAtual.folgas > 0 && <span className="text-sky-700">{tecnico.mesAtual.folgas} folga(s)</span>}
                </div>
              )}
            </div>
          </div>

          {chamadoAtivo && (
            <div>
              <h4 className="text-xs font-semibold text-tema-apagado uppercase mb-2">Atendimento Ativo da Equipe</h4>
              <div className="bg-tema-contraste/[0.02] rounded-lg p-3 text-sm">
                <p className="text-tema-tinta font-medium">{chamadoAtivo.cliente}</p>
                <p className="text-xs text-tema-apagado mt-0.5">{chamadoAtivo.endereco}</p>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Link
              href={`/horas-extras?funcionarioId=${tecnico.id}`}
              className="flex-1 gts-btn-secondary justify-center"
            >
              <Clock className="w-4 h-4" />
              Ver Horas
            </Link>
            <Link href="/map" className="flex-1 gts-btn-secondary justify-center">
              <MapPin className="w-4 h-4" />
              Ver no Mapa
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
