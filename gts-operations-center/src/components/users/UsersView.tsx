'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Plus, Edit2, Trash2, Shield,
  RefreshCw, CheckCircle, XCircle, Eye,
  EyeOff, Loader2, Lock, Mail, User,
  ShieldCheck, AlertTriangle, Search
} from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

const ROLES = [
  { value: 'ADMIN',    label: 'Administrador', cor: 'text-red-700 bg-red-500/10',         desc: 'Acesso total ao sistema' },
  { value: 'GESTOR',   label: 'Gestor',        cor: 'text-orange-700 bg-orange-500/10',   desc: 'Aprova vendas e devolucoes' },
  { value: 'OPERADOR', label: 'Operador NOC',  cor: 'text-blue-700 bg-blue-500/10',       desc: 'Gerencia chamados e equipes' },
  { value: 'TECNICO',  label: 'Tecnico',       cor: 'text-amber-700 bg-amber-500/10',     desc: 'Executa chamados em campo' },
  { value: 'VENDEDOR', label: 'Vendedor',      cor: 'text-emerald-700 bg-emerald-500/10', desc: 'Cadastra e acompanha vendas' },
]

const BOTAO_SECUNDARIO = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-tema-linha bg-tema-superficie text-sm font-medium text-tema-tinta hover:bg-tema-contraste/[0.03] transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40'

function getRoleCfg(role: string) {
  return ROLES.find(r => r.value === role) || ROLES[2]
}

async function fetchUsers() {
  const res = await fetch('/api/users')
  if (!res.ok) throw new Error()
  return res.json()
}

interface ModalProps {
  usuario?: any
  onClose: () => void
  onSuccess: () => void
}

function UsuarioModal({ usuario, onClose, onSuccess }: ModalProps) {
  const [form, setForm] = useState({
    nome:  usuario?.nome  || '',
    email: usuario?.email || '',
    senha: '',
    role:  usuario?.role  || 'OPERADOR',
    ativo: usuario?.ativo ?? true,
  })
  const [showSenha, setShowSenha] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar() {
    setLoading(true)
    setErro('')
    try {
      const url    = usuario ? `/api/users/${usuario.id}` : '/api/users'
      const method = usuario ? 'PATCH' : 'POST'
      const body: any = { ...form }
      if (usuario && !form.senha) delete body.senha

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        setErro(data.error || 'Erro ao salvar')
        return
      }

      toast({ title: usuario ? 'Usuario atualizado!' : 'Usuario criado!', variant: 'success' })
      onSuccess()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-tema-superficie border border-tema-linha rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-tema-linha">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <User className="w-4 h-4 text-orange-600" />
            </div>
            <h2 className="text-lg font-semibold text-tema-tinta">
              {usuario ? 'Editar Usuario' : 'Novo Usuario'}
            </h2>
          </div>
          <button onClick={onClose} className="text-tema-suave hover:text-tema-tinta">✕</button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-tema-suave mb-1.5">Nome completo *</label>
            <input
              value={form.nome}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              placeholder="Nome do usuario"
              className="w-full gts-input"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-tema-suave mb-1.5">E-mail *</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="email@empresa.com"
              className="w-full gts-input"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-tema-suave mb-1.5">
              {usuario ? 'Nova Senha (deixe vazio para nao alterar)' : 'Senha *'}
            </label>
            <div className="relative">
              <input
                type={showSenha ? 'text' : 'password'}
                value={form.senha}
                onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                placeholder={usuario ? '••••••••' : 'Minimo 6 caracteres'}
                className="w-full gts-input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSenha(!showSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-tema-apagado hover:text-tema-tinta"
              >
                {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-tema-suave mb-2">Perfil de Acesso *</label>
            <div className="space-y-2">
              {ROLES.map(r => (
                <label key={r.value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    checked={form.role === r.value}
                    onChange={() => setForm(f => ({ ...f, role: r.value }))}
                    className="sr-only"
                  />
                  <div className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border transition-all',
                    form.role === r.value
                      ? 'border-orange-500/40 bg-orange-500/10'
                      : 'border-tema-linha hover:border-tema-linha-forte bg-tema-contraste/[0.02]'
                  )}>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-bold', r.cor)}>
                      {r.label}
                    </span>
                    <p className="text-xs text-tema-apagado flex-1">{r.desc}</p>
                    {form.role === r.value && (
                      <CheckCircle className="w-3.5 h-3.5 text-orange-600" />
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-tema-contraste/[0.02] rounded-lg border border-tema-linha">
            <div>
              <p className="text-sm text-tema-tinta">Usuario ativo</p>
              <p className="text-xs text-tema-apagado">Usuarios inativos nao conseguem fazer login</p>
            </div>
            <button
              onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors',
                form.ativo ? 'bg-orange-500' : 'bg-tema-linha-forte'
              )}
            >
              <span className={cn(
                'absolute top-1 w-4 h-4 rounded-full bg-tema-superficie transition-transform',
                form.ativo ? 'translate-x-6' : 'translate-x-1'
              )} />
            </button>
          </div>

          {erro && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-700" />
              <p className="text-sm text-red-700">{erro}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 gts-btn-secondary justify-center">
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={loading}
              className="flex-1 gts-btn-primary justify-center"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                : <><CheckCircle className="w-4 h-4" /> {usuario ? 'Atualizar' : 'Criar Usuario'}</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function UsersView() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [busca, setBusca] = useState('')
  const [filtroRole, setFiltroRole] = useState('')

  const { data: usuarios = [], isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erro ao excluir')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast({ title: 'Usuario excluido', variant: 'default' })
      setConfirmDelete(null)
    },
    onError: () => toast({ title: 'Erro ao excluir usuario', variant: 'destructive' }),
  })

  const ativos   = usuarios.filter((u: any) => u.ativo).length
  const inativos = usuarios.filter((u: any) => !u.ativo).length

  const termo = busca.trim().toLowerCase()
  const filtrados = usuarios.filter((u: any) =>
    (!filtroRole || u.role === filtroRole) &&
    (!termo || (u.nome ?? '').toLowerCase().includes(termo) || (u.email ?? '').toLowerCase().includes(termo))
  )
  const algumFiltro = !!termo || !!filtroRole

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Usuários</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { setEditando(null); setShowModal(true) }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 focus-visible:ring-offset-2"
          >
            <Plus className="w-4 h-4" aria-hidden />
            Novo usuário
          </button>
          <button type="button" onClick={() => refetch()} disabled={isFetching} className={BOTAO_SECUNDARIO} style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} aria-hidden />
            Atualizar
          </button>
        </div>
      </div>

      {isError ? (
        <div className="card-orbia text-center py-14 px-4">
          <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
          <p className="font-medium text-tema-tinta">Não foi possível carregar os usuários</p>
          <button type="button" onClick={() => refetch()} className="gts-btn-secondary mx-auto mt-4">Tentar novamente</button>
        </div>
      ) : (
      <>
      {/* Perfis: contagem real e filtro por clique */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {ROLES.map(r => {
          const count = usuarios.filter((u: any) => u.role === r.value).length
          const ativo = filtroRole === r.value
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => setFiltroRole(ativo ? '' : r.value)}
              aria-pressed={ativo}
              title={ativo ? 'Remover filtro de perfil' : `Filtrar por ${r.label}`}
              className={cn(
                'card-orbia p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40',
                ativo && '!border-orange-500'
              )}
            >
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold inline-block mb-2', r.cor)}>{r.label}</span>
              <p className="text-2xl font-bold leading-none tabular-nums text-tema-tinta">{isLoading ? '···' : count}</p>
              <p className="text-xs text-tema-suave mt-1.5">{r.desc}</p>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center gap-3">
        <div className="relative sm:col-span-2 lg:flex-1 lg:min-w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tema-apagado" aria-hidden />
          <input
            type="search"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            aria-label="Buscar usuários"
            className="w-full gts-input pl-9 text-sm"
          />
        </div>
        {algumFiltro && (
          <button type="button" onClick={() => { setBusca(''); setFiltroRole('') }} className="text-sm text-orange-600 hover:text-orange-700 font-medium text-left">
            Limpar filtros
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="card-orbia overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs text-tema-suave bg-tema-contraste/[0.03]">
                <th scope="col" className="px-4 py-3 font-medium">Usuário</th>
                <th scope="col" className="px-4 py-3 font-medium">E-mail</th>
                <th scope="col" className="px-4 py-3 font-medium">Perfil</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Criado em</th>
                <th scope="col" className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-t border-tema-linha">{Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 skeleton rounded" /></td>
                    ))}</tr>
                  ))
                : filtrados.length === 0
                ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-tema-suave border-t border-tema-linha">
                        {algumFiltro ? 'Nenhum resultado para os filtros' : 'Nenhum usuário cadastrado'}
                      </td>
                    </tr>
                  )
                : filtrados.map((u: any) => {
                    const roleCfg = getRoleCfg(u.role)
                    return (
                      <tr key={u.id} className="border-t border-tema-linha hover:bg-tema-contraste/[0.03] transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-orange-500/15 flex items-center justify-center text-orange-700 text-xs font-bold flex-shrink-0" aria-hidden>
                              {u.nome?.[0]?.toUpperCase() || '?'}
                            </div>
                            <p className="text-sm text-tema-tinta font-medium">{u.nome}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-sm text-tema-suave break-all">
                            <Mail className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                            {u.email}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('text-xs px-2.5 py-1 rounded-full font-semibold', roleCfg.cor)}>{roleCfg.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          {u.ativo ? (
                            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 font-medium">
                              <CheckCircle className="w-3.5 h-3.5" aria-hidden /> Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-tema-contraste/[0.06] text-tema-suave font-medium">
                              <XCircle className="w-3.5 h-3.5" aria-hidden /> Inativo
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-tema-suave whitespace-nowrap">{formatDateTime(u.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => { setEditando(u); setShowModal(true) }}
                              className="p-1.5 text-tema-suave hover:text-blue-700 hover:bg-blue-500/10 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
                              title="Editar"
                              aria-label={`Editar ${u.nome}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(u)}
                              className="p-1.5 text-tema-suave hover:text-red-700 hover:bg-red-500/10 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
                              title="Excluir"
                              aria-label={`Excluir ${u.nome}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
        {!isLoading && (
          <p className="px-4 py-3 border-t border-tema-linha text-xs text-tema-suave">
            {algumFiltro ? `${filtrados.length} de ${usuarios.length}` : usuarios.length} {usuarios.length === 1 ? 'usuário' : 'usuários'} · {ativos} {ativos === 1 ? 'ativo' : 'ativos'} · {inativos} {inativos === 1 ? 'inativo' : 'inativos'}
          </p>
        )}
      </div>
      </>
      )}

      {/* Modal criar/editar */}
      {showModal && (
        <UsuarioModal
          usuario={editando}
          onClose={() => { setShowModal(false); setEditando(null) }}
          onSuccess={() => {
            setShowModal(false)
            setEditando(null)
            queryClient.invalidateQueries({ queryKey: ['users'] })
          }}
        />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <ConfirmDialog
          titulo="Excluir usuario?"
          mensagem={
            <>Tem certeza que deseja excluir o usuario <strong className="text-tema-tinta">{confirmDelete.nome}</strong>? Esta acao nao pode ser desfeita.</>
          }
          confirmarLabel="Excluir"
          carregando={deleteMutation.isPending}
          onConfirmar={() => deleteMutation.mutate(confirmDelete.id)}
          onCancelar={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}