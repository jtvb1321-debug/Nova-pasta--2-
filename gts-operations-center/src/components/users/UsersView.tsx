'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Plus, Edit2, Trash2, Shield,
  RefreshCw, CheckCircle, XCircle, Eye,
  EyeOff, Loader2, Lock, Mail, User,
  ShieldCheck, AlertTriangle
} from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

const ROLES = [
  { value: 'ADMIN',    label: 'Administrador', cor: 'text-red-700 bg-red-500/10',         desc: 'Acesso total ao sistema' },
  { value: 'GESTOR',   label: 'Gestor',        cor: 'text-orange-700 bg-orange-500/10',   desc: 'Aprova vendas e devolucoes' },
  { value: 'OPERADOR', label: 'Operador NOC',  cor: 'text-blue-700 bg-blue-500/10',       desc: 'Gerencia chamados e equipes' },
  { value: 'TECNICO',  label: 'Tecnico',       cor: 'text-amber-700 bg-amber-500/10',     desc: 'Executa chamados em campo' },
  { value: 'VENDEDOR', label: 'Vendedor',      cor: 'text-emerald-700 bg-emerald-500/10', desc: 'Cadastra e acompanha vendas' },
]

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
      <div className="bg-white border border-[#E6E1D6] rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E6E1D6]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <User className="w-4 h-4 text-orange-600" />
            </div>
            <h2 className="text-lg font-semibold text-[#201D17]">
              {usuario ? 'Editar Usuario' : 'Novo Usuario'}
            </h2>
          </div>
          <button onClick={onClose} className="text-[#7A7266] hover:text-[#201D17]">✕</button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#7A7266] mb-1.5">Nome completo *</label>
            <input
              value={form.nome}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              placeholder="Nome do usuario"
              className="w-full gts-input"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#7A7266] mb-1.5">E-mail *</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="email@empresa.com"
              className="w-full gts-input"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#7A7266] mb-1.5">
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A69E8F] hover:text-[#201D17]"
              >
                {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#7A7266] mb-2">Perfil de Acesso *</label>
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
                      : 'border-[#E6E1D6] hover:border-[#D8D2C3] bg-black/[0.02]'
                  )}>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-bold', r.cor)}>
                      {r.label}
                    </span>
                    <p className="text-xs text-[#A69E8F] flex-1">{r.desc}</p>
                    {form.role === r.value && (
                      <CheckCircle className="w-3.5 h-3.5 text-orange-600" />
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-black/[0.02] rounded-lg border border-[#E6E1D6]">
            <div>
              <p className="text-sm text-[#201D17]">Usuario ativo</p>
              <p className="text-xs text-[#A69E8F]">Usuarios inativos nao conseguem fazer login</p>
            </div>
            <button
              onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors',
                form.ativo ? 'bg-orange-500' : 'bg-[#D8D2C3]'
              )}
            >
              <span className={cn(
                'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
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

  const { data: usuarios = [], isLoading, refetch } = useQuery({
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

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Gestao de Usuarios"
        subtitle={`${usuarios.length} usuario(s) cadastrado(s) · ${ativos} ativo(s) · ${inativos} inativo(s)`}
        actions={
          <>
            <button onClick={() => refetch()} className="gts-btn-secondary">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setEditando(null); setShowModal(true) }}
              className="gts-btn-primary"
            >
              <Plus className="w-4 h-4" />
              Novo Usuario
            </button>
          </>
        }
      />

      {/* Info permissoes */}
      <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/25 rounded-xl">
        <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-blue-700 font-medium text-sm">Area Restrita — Apenas Administrador</p>
          <p className="text-[#A69E8F] text-xs mt-0.5">
            Gerencie os usuarios do sistema, seus perfis de acesso e permissoes. Usuarios inativos nao conseguem fazer login.
          </p>
        </div>
      </div>

      {/* Cards de perfis */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {ROLES.map(r => {
          const count = usuarios.filter((u: any) => u.role === r.value).length
          return (
            <div key={r.value} className="gts-card text-center">
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-bold inline-block mb-2', r.cor)}>
                {r.label}
              </span>
              <p className={cn('text-2xl font-bold', r.cor.split(' ')[0])}>{count}</p>
              <p className="text-xs text-[#A69E8F] mt-1">{r.desc}</p>
            </div>
          )
        })}
      </div>

      {/* Tabela */}
      <div className="gts-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="gts-table">
            <thead>
              <tr>
                <th className="px-4 pt-4">Usuario</th>
                <th className="px-4 pt-4">E-mail</th>
                <th className="px-4 pt-4">Perfil</th>
                <th className="px-4 pt-4">Status</th>
                <th className="px-4 pt-4">Criado em</th>
                <th className="px-4 pt-4">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4"><div className="h-4 skeleton rounded" /></td>
                    ))}</tr>
                  ))
                : usuarios.map((u: any) => {
                    const roleCfg = getRoleCfg(u.role)
                    return (
                      <tr key={u.id}>
                        <td className="px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-700 text-xs font-bold flex-shrink-0">
                              {u.nome?.[0]?.toUpperCase() || '?'}
                            </div>
                            <p className="text-sm text-[#201D17] font-medium">{u.nome}</p>
                          </div>
                        </td>
                        <td className="px-4">
                          <div className="flex items-center gap-1.5 text-sm text-[#7A7266]">
                            <Mail className="w-3.5 h-3.5" />
                            {u.email}
                          </div>
                        </td>
                        <td className="px-4">
                          <span className={cn('text-xs px-2 py-0.5 rounded-full font-bold', roleCfg.cor)}>
                            {roleCfg.label}
                          </span>
                        </td>
                        <td className="px-4">
                          <span className={cn(
                            'flex items-center gap-1 text-xs font-medium w-fit',
                            u.ativo ? 'text-emerald-700' : 'text-[#A69E8F]'
                          )}>
                            {u.ativo
                              ? <><CheckCircle className="w-3.5 h-3.5" /> Ativo</>
                              : <><XCircle className="w-3.5 h-3.5" /> Inativo</>
                            }
                          </span>
                        </td>
                        <td className="px-4 text-xs text-[#A69E8F]">
                          {formatDateTime(u.createdAt)}
                        </td>
                        <td className="px-4">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setEditando(u); setShowModal(true) }}
                              className="p-1.5 text-[#A69E8F] hover:text-blue-700 hover:bg-blue-500/10 rounded-lg transition-colors"
                              title="Editar"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDelete(u)}
                              className="p-1.5 text-[#A69E8F] hover:text-red-700 hover:bg-red-500/10 rounded-lg transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      </div>

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
            <>Tem certeza que deseja excluir o usuario <strong className="text-[#201D17]">{confirmDelete.nome}</strong>? Esta acao nao pode ser desfeita.</>
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