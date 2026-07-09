'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings, Save, Shield, Bell,
  Map, Clock, Package, Users, Palette,
  ChevronRight, CheckCircle, Loader2, Lock
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import type { Session } from 'next-auth'

type Aba = 'geral' | 'operacional' | 'alertas' | 'aparencia' | 'seguranca'

interface Props { session: Session }

async function fetchSettings() {
  const res = await fetch('/api/settings')
  if (!res.ok) return {}
  return res.json()
}

async function saveSettings(data: Record<string, string>) {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Erro ao salvar')
  return res.json()
}

export function SettingsView({ session }: Props) {
  const queryClient = useQueryClient()
  const [aba, setAba] = useState<Aba>('geral')
  const [form, setForm] = useState<Record<string, string>>({})

  const role = (session.user as any)?.role
  const isAdmin = role === 'ADMIN'

  const { data: configs = {} } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  })

  useEffect(() => {
    if (configs && Object.keys(configs).length > 0) {
      setForm(configs as Record<string, string>)
    }
  }, [configs])

  const mutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast({ title: 'Configuracoes salvas com sucesso!', variant: 'success' })
    },
    onError: () => toast({ title: 'Erro ao salvar configuracoes', variant: 'destructive' }),
  })

  function set(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function get(key: string, fallback = '') {
    return form[key] ?? (configs as any)[key] ?? fallback
  }

  const abas = [
    { id: 'geral'       as Aba, label: 'Geral',        icon: Settings },
    { id: 'operacional' as Aba, label: 'Operacional',  icon: Map },
    { id: 'alertas'     as Aba, label: 'Alertas',      icon: Bell },
    { id: 'aparencia'   as Aba, label: 'Aparencia',    icon: Palette },
    { id: 'seguranca'   as Aba, label: 'Seguranca',    icon: Shield },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Configuracoes</h1>
          <p className="text-gray-500 text-sm mt-1">Gerencie as configuracoes do sistema</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => mutation.mutate(form)}
            disabled={mutation.isPending}
            className="gts-btn-primary"
          >
            {mutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
              : <><Save className="w-4 h-4" /> Salvar Alteracoes</>
            }
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
          <Lock className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <p className="text-yellow-400 text-sm">
            Voce esta no modo leitura. Apenas o Administrador pode alterar as configuracoes.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Menu lateral */}
        <div className="gts-card p-2 space-y-1 h-fit">
          {abas.map(a => {
            const Icon = a.icon
            return (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  aba === a.id
                    ? 'bg-orange-500/10 text-orange-400'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  {a.label}
                </div>
                <ChevronRight className={cn('w-3.5 h-3.5', aba === a.id ? 'text-orange-400' : 'text-gray-600')} />
              </button>
            )
          })}
        </div>

        {/* Conteudo */}
        <div className="lg:col-span-3 space-y-4">

          {/* ABA GERAL */}
          {aba === 'geral' && (
            <div className="space-y-4">
              <div className="gts-card space-y-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-orange-400" />
                  Informacoes da Empresa
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Nome da Empresa</label>
                    <input value={get('empresa_nome', 'GTSNet')} onChange={e => set('empresa_nome', e.target.value)} disabled={!isAdmin} className="w-full gts-input disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">CNPJ</label>
                    <input value={get('empresa_cnpj', '')} onChange={e => set('empresa_cnpj', e.target.value)} disabled={!isAdmin} placeholder="00.000.000/0001-00" className="w-full gts-input disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Telefone</label>
                    <input value={get('empresa_telefone', '')} onChange={e => set('empresa_telefone', e.target.value)} disabled={!isAdmin} placeholder="(00) 00000-0000" className="w-full gts-input disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
                    <input value={get('empresa_email', '')} onChange={e => set('empresa_email', e.target.value)} disabled={!isAdmin} placeholder="contato@empresa.com.br" className="w-full gts-input disabled:opacity-50" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Endereco</label>
                    <input value={get('empresa_endereco', '')} onChange={e => set('empresa_endereco', e.target.value)} disabled={!isAdmin} placeholder="Rua, numero, cidade - UF" className="w-full gts-input disabled:opacity-50" />
                  </div>
                </div>
              </div>

              <div className="gts-card space-y-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-400" />
                  Sistema
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Fuso Horario</label>
                    <select value={get('sistema_timezone', 'America/Sao_Paulo')} onChange={e => set('sistema_timezone', e.target.value)} disabled={!isAdmin} className="w-full gts-input disabled:opacity-50">
                      <option value="America/Sao_Paulo">Brasilia (GMT-3)</option>
                      <option value="America/Manaus">Manaus (GMT-4)</option>
                      <option value="America/Belem">Belem (GMT-3)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Intervalo de Atualizacao</label>
                    <select value={get('sistema_intervalo', '30')} onChange={e => set('sistema_intervalo', e.target.value)} disabled={!isAdmin} className="w-full gts-input disabled:opacity-50">
                      <option value="15">15 segundos</option>
                      <option value="30">30 segundos</option>
                      <option value="60">1 minuto</option>
                      <option value="120">2 minutos</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA OPERACIONAL */}
          {aba === 'operacional' && (
            <div className="space-y-4">
              <div className="gts-card space-y-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-orange-400" />
                  Chamados e Equipes
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">SLA Padrao (horas)</label>
                    <input type="number" value={get('sla_horas', '24')} onChange={e => set('sla_horas', e.target.value)} disabled={!isAdmin} className="w-full gts-input disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Meta Diaria de Chamados</label>
                    <input type="number" value={get('meta_chamados_dia', '6')} onChange={e => set('meta_chamados_dia', e.target.value)} disabled={!isAdmin} className="w-full gts-input disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Tempo Maximo Atividade (min)</label>
                    <input type="number" value={get('tempo_max_atividade', '120')} onChange={e => set('tempo_max_atividade', e.target.value)} disabled={!isAdmin} className="w-full gts-input disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Comissao por Venda (R$)</label>
                    <input type="number" value={get('comissao_venda', '25')} onChange={e => set('comissao_venda', e.target.value)} disabled={!isAdmin} className="w-full gts-input disabled:opacity-50" />
                  </div>
                </div>
              </div>

              <div className="gts-card space-y-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Package className="w-4 h-4 text-orange-400" />
                  Estoque
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Estoque Minimo Padrao</label>
                    <input type="number" value={get('estoque_minimo_padrao', '5')} onChange={e => set('estoque_minimo_padrao', e.target.value)} disabled={!isAdmin} className="w-full gts-input disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Aprovacao de Devolucoes</label>
                    <select value={get('devolucao_aprovacao', 'ADMIN')} onChange={e => set('devolucao_aprovacao', e.target.value)} disabled={!isAdmin} className="w-full gts-input disabled:opacity-50">
                      <option value="ADMIN">Somente Admin</option>
                      <option value="GESTOR">Admin e Gestor</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA ALERTAS */}
          {aba === 'alertas' && (
            <div className="space-y-4">
              <div className="gts-card space-y-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Map className="w-4 h-4 text-orange-400" />
                  Rastreamento e Velocidade
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Limite de Velocidade (km/h)</label>
                    <input type="number" value={get('velocidade_alerta', '80')} onChange={e => set('velocidade_alerta', e.target.value)} disabled={!isAdmin} className="w-full gts-input disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Intervalo Rastreamento (seg)</label>
                    <input type="number" value={get('rastreamento_intervalo', '30')} onChange={e => set('rastreamento_intervalo', e.target.value)} disabled={!isAdmin} className="w-full gts-input disabled:opacity-50" />
                  </div>
                </div>
              </div>

              <div className="gts-card space-y-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Bell className="w-4 h-4 text-orange-400" />
                  Notificacoes
                </h2>
                <div className="space-y-3">
                  {[
                    { key: 'alerta_estoque_critico', label: 'Alerta de estoque critico',      desc: 'Notificar quando item abaixo do minimo' },
                    { key: 'alerta_sla_vencendo',    label: 'Alerta de SLA vencendo',          desc: 'Notificar chamados proximos do prazo' },
                    { key: 'alerta_velocidade',      label: 'Alerta de velocidade excessiva',  desc: 'Notificar quando veiculo exceder limite' },
                    { key: 'alerta_equipe_parada',   label: 'Alerta de equipe parada',         desc: 'Notificar equipe sem atividade por muito tempo' },
                    { key: 'alerta_devolucao',       label: 'Alerta de devolucao pendente',    desc: 'Notificar quando houver devolucao aguardando' },
                  ].map(item => (
                    <div key={item.key} className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg border border-white/5">
                      <div>
                        <p className="text-sm text-white font-medium">{item.label}</p>
                        <p className="text-xs text-gray-500">{item.desc}</p>
                      </div>
                      <button
                        onClick={() => isAdmin && set(item.key, get(item.key, '1') === '1' ? '0' : '1')}
                        className={cn(
                          'relative w-11 h-6 rounded-full transition-colors',
                          get(item.key, '1') === '1' ? 'bg-orange-500' : 'bg-gray-700',
                          !isAdmin && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <span className={cn(
                          'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                          get(item.key, '1') === '1' ? 'translate-x-6' : 'translate-x-1'
                        )} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ABA APARENCIA */}
          {aba === 'aparencia' && (
            <div className="space-y-4">
              <div className="gts-card space-y-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Palette className="w-4 h-4 text-orange-400" />
                  Identidade Visual
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Cor Principal</label>
                    <div className="flex gap-2">
                      <input type="color" value={get('cor_primaria', '#FF7A00')} onChange={e => set('cor_primaria', e.target.value)} disabled={!isAdmin} className="w-10 h-10 rounded-lg border border-white/10 cursor-pointer bg-transparent disabled:opacity-50" />
                      <input value={get('cor_primaria', '#FF7A00')} onChange={e => set('cor_primaria', e.target.value)} disabled={!isAdmin} className="flex-1 gts-input font-mono disabled:opacity-50" placeholder="#FF7A00" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Cor Secundaria</label>
                    <div className="flex gap-2">
                      <input type="color" value={get('cor_secundaria', '#333333')} onChange={e => set('cor_secundaria', e.target.value)} disabled={!isAdmin} className="w-10 h-10 rounded-lg border border-white/10 cursor-pointer bg-transparent disabled:opacity-50" />
                      <input value={get('cor_secundaria', '#333333')} onChange={e => set('cor_secundaria', e.target.value)} disabled={!isAdmin} className="flex-1 gts-input font-mono disabled:opacity-50" placeholder="#333333" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">Cores Rapidas GTSNet</label>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { label: 'Laranja GTSNet', value: '#FF7A00' },
                      { label: 'Azul',           value: '#2563EB' },
                      { label: 'Verde',          value: '#10B981' },
                      { label: 'Roxo',           value: '#8B5CF6' },
                    ].map(c => (
                      <button key={c.value} onClick={() => isAdmin && set('cor_primaria', c.value)} disabled={!isAdmin} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-300 hover:bg-white/10 transition-colors disabled:opacity-50">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.value }} />
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="gts-card space-y-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-orange-400" />
                  Interface
                </h2>
                <div className="space-y-3">
                  {[
                    { key: 'sidebar_collapsed_default', label: 'Menu lateral colapsado por padrao' },
                    { key: 'topbar_show_kpis',           label: 'Mostrar KPIs na barra superior' },
                    { key: 'dashboard_auto_refresh',     label: 'Atualizar dashboard automaticamente' },
                    { key: 'tv_auto_rotate',             label: 'Rotacao automatica no Modo TV' },
                  ].map(item => (
                    <div key={item.key} className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg border border-white/5">
                      <p className="text-sm text-white">{item.label}</p>
                      <button
                        onClick={() => isAdmin && set(item.key, get(item.key, '1') === '1' ? '0' : '1')}
                        className={cn(
                          'relative w-11 h-6 rounded-full transition-colors',
                          get(item.key, '1') === '1' ? 'bg-orange-500' : 'bg-gray-700',
                          !isAdmin && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <span className={cn(
                          'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                          get(item.key, '1') === '1' ? 'translate-x-6' : 'translate-x-1'
                        )} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ABA SEGURANCA */}
          {aba === 'seguranca' && (
            <div className="space-y-4">
              <div className="gts-card space-y-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-orange-400" />
                  Informacoes da Sessao
                </h2>
                <div className="space-y-3">
                  {[
                    { label: 'Usuario', value: (session.user as any)?.name  || '—' },
                    { label: 'E-mail',  value: session.user?.email           || '—' },
                    { label: 'Perfil',  value: (session.user as any)?.role  || '—' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg border border-white/5">
                      <span className="text-sm text-gray-400">{item.label}</span>
                      <span className="text-sm text-white font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="gts-card space-y-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-orange-400" />
                  Acesso ao Sistema
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Tempo de Sessao (horas)</label>
                    <input type="number" value={get('sessao_horas', '8')} onChange={e => set('sessao_horas', e.target.value)} disabled={!isAdmin} className="w-full gts-input disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Tentativas de Login</label>
                    <input type="number" value={get('login_tentativas', '5')} onChange={e => set('login_tentativas', e.target.value)} disabled={!isAdmin} className="w-full gts-input disabled:opacity-50" />
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { key: 'log_acessos',  label: 'Registrar todos os acessos no log de auditoria' },
                    { key: 'dois_fatores', label: 'Exigir confirmacao em acoes criticas' },
                  ].map(item => (
                    <div key={item.key} className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg border border-white/5">
                      <p className="text-sm text-white">{item.label}</p>
                      <button
                        onClick={() => isAdmin && set(item.key, get(item.key, '1') === '1' ? '0' : '1')}
                        className={cn(
                          'relative w-11 h-6 rounded-full transition-colors',
                          get(item.key, '1') === '1' ? 'bg-orange-500' : 'bg-gray-700',
                          !isAdmin && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <span className={cn(
                          'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                          get(item.key, '1') === '1' ? 'translate-x-6' : 'translate-x-1'
                        )} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="gts-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">GTS Operations Center</p>
                    <p className="text-xs text-gray-500 mt-1">Versao 1.0.0 — GTSNet © {new Date().getFullYear()}</p>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs text-emerald-400 font-medium">Sistema OK</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}