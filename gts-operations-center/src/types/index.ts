// src/types/index.ts
// Tipos centralizados do GTS Operations Center

import type {
  Usuario,
  Equipe,
  Funcionario,
  Veiculo,
  ItemEstoque,
  Movimentacao,
  Chamado,
  Venda,
  Comissao,
  UserRole,
  StatusEquipe,
  CategoriaEstoque,
  TipoMovimentacao,
  TipoChamado,
  StatusChamado,
  StatusVenda,
} from '@prisma/client'

export type {
  Usuario,
  Equipe,
  Funcionario,
  Veiculo,
  ItemEstoque,
  Movimentacao,
  Chamado,
  Venda,
  Comissao,
  UserRole,
  StatusEquipe,
  CategoriaEstoque,
  TipoMovimentacao,
  TipoChamado,
  StatusChamado,
  StatusVenda,
}

// ================================
// TIPOS COMPOSTOS
// ================================

export type EquipeComFuncionarios = Equipe & {
  funcionarios: Funcionario[]
  veiculo: Veiculo | null
}

export type ChamadoCompleto = Chamado & {
  equipe: EquipeComFuncionarios | null
}

export type EstoqueComMovimentacoes = ItemEstoque & {
  movimentacoes: Movimentacao[]
}

export type VendaCompleta = Venda & {
  vendedor: Pick<Usuario, 'id' | 'nome' | 'email'>
  comissao: Comissao | null
}

// ================================
// TIPOS DO RASTREAMENTO
// ================================

export interface VeiculoRastreado {
  id: string
  nome: string
  placa: string
  latitude: number
  longitude: number
  velocidade: number
  direcao: number
  ignicao: boolean
  online: boolean
  ultimaAtualizacao: string
  motorista?: string
  endereco?: string
}

export interface PosicaoHistorico {
  latitude: number
  longitude: number
  velocidade: number
  timestamp: string
  ignicao: boolean
}

// ================================
// TIPOS DE FORMULARIO
// ================================

export interface LoginForm {
  email: string
  password: string
}

export interface ChamadoForm {
  cliente: string
  endereco: string
  cidade: string
  telefone?: string
  tipo: TipoChamado
  observacao?: string
  equipeId?: string
  materiais?: { itemId: string; quantidade: number }[]
}

export interface EstoqueForm {
  codigo: string
  descricao: string
  categoria: CategoriaEstoque
  unidade: string
  quantidadeAtual: number
  quantidadeMinima: number
  fornecedor?: string
  valorUnitario: number
  observacao?: string
}

export interface MovimentacaoForm {
  itemId: string
  tipo: TipoMovimentacao
  quantidade: number
  motivo?: string
  chamadoId?: string
}

export interface VendaForm {
  clienteNome: string
  telefone?: string
  cidade: string
  planoVendido: string
  valor: number
  observacoes?: string
}

// ================================
// TIPOS DE API
// ================================

export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface DashboardStats {
  veiculosTotal: number
  veiculosOnline: number
  veiculosOffline: number
  equipesCampo: number
  chamadosAndamento: number
  estoqueBaixo: number
  totalVendas: number
  materiaisHoje: number
}

// ================================
// STATUS LABELS
// ================================

export const STATUS_EQUIPE_LABELS: Record<StatusEquipe, string> = {
  AGUARDANDO: 'Aguardando Chamado',
  DESLOCAMENTO: 'Em Deslocamento',
  ATIVIDADE: 'Em Atividade',
  FINALIZADO: 'Finalizado',
}

export const STATUS_EQUIPE_CORES: Record<StatusEquipe, string> = {
  AGUARDANDO: '#2563EB',
  DESLOCAMENTO: '#F59E0B',
  ATIVIDADE: '#10B981',
  FINALIZADO: '#6B7280',
}

export const STATUS_CHAMADO_LABELS: Record<StatusChamado, string> = {
  ABERTO: 'Aberto',
  EM_ANDAMENTO: 'Em Andamento',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
  AGENDADO: 'Agendado',
}

export const TIPO_CHAMADO_LABELS: Record<TipoChamado, string> = {
  INSTALACAO: 'Instalação',
  MANUTENCAO: 'Manutenção',
  RETIRADA: 'Retirada',
  SUPORTE: 'Suporte',
  ROMPIMENTO_MASSIVO: 'Rompimento Massivo',
}

export const CATEGORIA_LABELS: Record<CategoriaEstoque, string> = {
  GTSNET: 'GTSNet',
  EACE: 'EACE',
  FERRAMENTAS: 'Ferramentas',
  LIMPEZA: 'Limpeza',
  MANINFO: 'ManINFO',
}

export const STATUS_VENDA_LABELS: Record<StatusVenda, string> = {
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
  REPROVADO: 'Reprovado',
}