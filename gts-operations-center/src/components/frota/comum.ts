import type { StatusSemana, NivelLicenciamento } from '@/lib/frota/semana'
import type { Combustivel, StatusItem, TipoVistoria } from '@/lib/frota/regras'

// Tipos e utilitarios do cliente (telas da Frota).

export interface ViaturaFrota {
  id: string
  placa: string
  marca: string | null
  modelo: string
  ano: number | null
  patrimonio: string | null
  uf: string | null
  cidadeBase: string | null
  setor: string | null
  equipe: { id: string; nome: string } | null
  responsavel: { id: string; nome: string } | null
  kmAtual: number | null
  licenciamento: { venceEm: string | null; nivel: NivelLicenciamento; dias: number | null }
  statusSemana: StatusSemana
  feitaEm: string | null
  pendenciasSemana: number | null
  ultimaVistoria: { id: string; em: string; tipo: TipoVistoria; pendencias: number } | null
}

export interface PainelSemana {
  semanaDesde: string
  total: number
  feitas: number
  semPendencias: number
  comPendencias: number
  pendentesHoje: number
  atrasadas: number
}

export interface DetalheVistoria {
  id: string; veiculoId: string; placa: string; tipo: TipoVistoria; vistoriadorNome: string; km: number; combustivel: Combustivel; observacoes: string | null
  totalOk: number; totalFalta: number; totalAvaria: number; criadoEm: string
  viatura: { marca: string | null; modelo: string; ano: number | null; patrimonio: string | null; uf: string | null; cidadeBase: string | null; setor: string | null }
  fotos: { id: string; tipo: string; rotulo: string }[]
  itens: { categoria: string; nome: string; quantidade: number | null; status: StatusItem; descricao: string | null; fotoId: string | null }[]
}

export interface RespostaViaturas { painel: PainelSemana; viaturas: ViaturaFrota[]; ufs: string[]; podeVistoriar: boolean; podeAdministrar: boolean }

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e: Error & { dados?: any; status?: number } = new Error(corpo.error || 'Não foi possível concluir o pedido.')
    e.dados = corpo; e.status = r.status
    throw e
  }
  return corpo as T
}

export const json = (metodo: string, corpo: unknown): RequestInit => ({ method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })

export const dataBR = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}
export const dataHoraBR = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
export const diaMes = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
}
/** AAAA-MM-DD (data sem hora, como vem do servidor) -> dd/mm/aaaa, sem passar por fuso. */
export const dataSimples = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : '—')
export const km = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('pt-BR')} km`)

export const campo = 'gts-input text-sm w-full'
export const rotulo = 'mb-1 block text-xs font-semibold text-tema-suave'

export const urlFoto = (id: string) => `/api/frota/fotos/${id}`
export const linkMotorista = (placa: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/frota/vistoria/${placa}`

export async function copiar(texto: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(texto); return true } catch { /* tenta o plano B */ }
  try {
    const t = document.createElement('textarea')
    t.value = texto; t.style.position = 'fixed'; t.style.opacity = '0'
    document.body.appendChild(t); t.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(t)
    return ok
  } catch { return false }
}

/** Reduz a foto no navegador: lado maior 1600 px, JPEG 0,8. Se o aparelho nao conseguir, devolve a original. */
export async function comprimirImagem(arquivo: File, ladoMaior = 1600, qualidade = 0.8): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    const escala = Math.min(1, ladoMaior / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * escala)); canvas.height = Math.max(1, Math.round(bitmap.height * escala))
    const ctx = canvas.getContext('2d')
    if (!ctx) return arquivo
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', qualidade))
    return blob && blob.size > 0 ? blob : arquivo
  } catch { return arquivo }
}
