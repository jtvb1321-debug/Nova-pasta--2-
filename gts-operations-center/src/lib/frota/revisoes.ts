import { z } from 'zod'
import { dataSemHora } from './esquemas'
import { hojeSP } from './semana'

// Revisoes da Frota: tipos de servico, validacao de entrada e alerta de "proxima revisao" (por data e/ou por km).
// Funcoes puras: a tela e as rotas usam as mesmas regras.

export const TIPOS_REVISAO = [
  'TROCA_OLEO', 'TROCA_PNEUS', 'REVISAO_PREVENTIVA', 'FREIOS', 'ALINHAMENTO_BALANCEAMENTO', 'BATERIA', 'FILTROS',
  'SUSPENSAO', 'CORREIAS', 'ELETRICA', 'LATARIA_PINTURA', 'MECANICA_GERAL', 'OUTRO',
] as const
export type TipoRevisao = (typeof TIPOS_REVISAO)[number]

export const ROTULO_REVISAO: Record<TipoRevisao, string> = {
  TROCA_OLEO: 'Troca de óleo',
  TROCA_PNEUS: 'Troca de pneus',
  REVISAO_PREVENTIVA: 'Revisão preventiva',
  FREIOS: 'Freios',
  ALINHAMENTO_BALANCEAMENTO: 'Alinhamento e balanceamento',
  BATERIA: 'Bateria',
  FILTROS: 'Filtros',
  SUSPENSAO: 'Suspensão',
  CORREIAS: 'Correias',
  ELETRICA: 'Parte elétrica',
  LATARIA_PINTURA: 'Lataria e pintura',
  MECANICA_GERAL: 'Mecânica geral',
  OUTRO: 'Outro serviço',
}

/** Rotulo de um tipo gravado (tipo desconhecido, de uma versao futura, aparece como esta no banco). */
export const rotuloRevisao = (tipo: string): string => (ROTULO_REVISAO as Record<string, string>)[tipo] ?? tipo

export const JANELA_DIAS = 30
export const JANELA_KM = 1000
export const VALOR_MAXIMO_CENTAVOS = 100_000_000 // R$ 1.000.000,00

const vazio = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)
const texto = (max: number, rotulo: string) => z.preprocess(vazio, z.string().trim().min(1).max(max, `${rotulo}: no máximo ${max} caracteres.`).nullable().optional())
const inteiro = (rotulo: string, max: number) => z.preprocess(v => (v === '' ? undefined : v), z.number({ invalid_type_error: `${rotulo}: informe um número.` }).int(`${rotulo}: informe um número inteiro.`).min(0, `${rotulo}: não pode ser negativo.`).max(max, `${rotulo}: fora do limite.`).nullable().optional())
const dia = (rotulo: string) => z.preprocess(vazio, z.string().refine(v => dataSemHora(v) !== null, `${rotulo}: data inválida.`).nullable().optional())

const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'identificador inválido')

const campos = {
  tipo: z.enum(TIPOS_REVISAO, { errorMap: () => ({ message: 'Escolha o tipo de serviço.' }) }),
  descricao: texto(300, 'Descrição'),
  data: z.string({ required_error: 'Informe a data do serviço.' }).refine(v => dataSemHora(v) !== null, 'Data do serviço inválida.')
    .refine(v => v <= hojeSP(new Date()), 'A data do serviço não pode ser futura.'),
  km: inteiro('Km', 2_000_000),
  valorCentavos: inteiro('Valor', VALOR_MAXIMO_CENTAVOS),
  fornecedor: texto(80, 'Oficina/fornecedor'),
  notaNumero: texto(40, 'Número da nota'),
  proximaEm: dia('Próxima revisão'),
  proximaEmKm: inteiro('Próxima revisão (km)', 2_000_000),
  observacoes: texto(500, 'Observações'),
}

export const revisaoSchema = z.object({ veiculoId: id, ...campos }).strict()
// Na edicao a viatura nao muda (o servico pertence a ela); todo o resto pode ser alterado ou limpo (null).
export const revisaoPatchSchema = z.object(campos).partial().strict()

export interface DadosCoerencia { tipo?: string | null; descricao?: string | null; data?: string | null; km?: number | null; proximaEm?: string | null; proximaEmKm?: number | null }

/** Regras que cruzam campos. Devolve a mensagem do primeiro problema, ou null. */
export function validarCoerencia(d: DadosCoerencia): { campo: string; mensagem: string } | null {
  if (d.tipo === 'OUTRO' && !d.descricao?.trim()) return { campo: 'descricao', mensagem: 'Descreva o serviço feito (tipo "Outro serviço").' }
  if (d.proximaEm && d.data && d.proximaEm < d.data) return { campo: 'proximaEm', mensagem: 'A próxima revisão não pode ser antes da data do serviço.' }
  if (d.proximaEmKm != null && d.km != null && d.proximaEmKm <= d.km) return { campo: 'proximaEmKm', mensagem: 'O km da próxima revisão precisa ser maior que o km deste serviço.' }
  return null
}

/** "1.234,56" / "1234,5" / "1234.56" -> centavos; null se vazio ou invalido. */
export function reaisParaCentavos(texto: string): number | null {
  const t = texto.replace(/[^\d.,]/g, '')
  if (!t) return null
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : (/\.\d{1,2}$/.test(t) ? t : t.replace(/\./g, ''))
  const n = Number(norm)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

export const centavosParaReais = (c: number | null | undefined): string => (c == null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))

export type NivelRevisao = 'OK' | 'PROXIMA' | 'VENCIDA'
const ORDEM: Record<NivelRevisao, number> = { OK: 0, PROXIMA: 1, VENCIDA: 2 }

export interface AvaliacaoRevisao {
  nivel: NivelRevisao
  /** Dias ate a data (negativo = passou). Null se a revisao nao tem data. */
  dias: number | null
  /** Km que faltam (negativo/zero = passou). Null se nao ha km previsto ou a viatura nao tem km atual. */
  kmRestante: number | null
}

/**
 * Situacao da proxima revisao: VENCIDA se a data passou ou o km atual ja chegou la; PROXIMA ate 30 dias / 1.000 km antes.
 * Vale o pior dos dois criterios. Sem data e sem km previstos nao ha alerta (devolve null).
 */
export function avaliarProxima(r: { proximaEm: Date | null; proximaEmKm: number | null }, kmAtual: number | null, agora: Date): AvaliacaoRevisao | null {
  let dias: number | null = null
  let kmRestante: number | null = null
  let nivel: NivelRevisao = 'OK'
  if (r.proximaEm) {
    const [a, m, d] = hojeSP(agora).split('-').map(Number)
    dias = Math.round((Date.UTC(r.proximaEm.getUTCFullYear(), r.proximaEm.getUTCMonth(), r.proximaEm.getUTCDate()) - Date.UTC(a, m - 1, d)) / 86_400_000)
    nivel = dias < 0 ? 'VENCIDA' : dias <= JANELA_DIAS ? 'PROXIMA' : 'OK'
  }
  if (r.proximaEmKm != null) {
    if (kmAtual != null) {
      kmRestante = r.proximaEmKm - kmAtual
      const porKm: NivelRevisao = kmRestante <= 0 ? 'VENCIDA' : kmRestante <= JANELA_KM ? 'PROXIMA' : 'OK'
      if (ORDEM[porKm] > ORDEM[nivel]) nivel = porKm
    }
  }
  if (!r.proximaEm && r.proximaEmKm == null) return null
  return { nivel, dias, kmRestante }
}

// Limites das notas fiscais (usados pela tela e pelo servidor).
export const TAMANHO_MAXIMO_ANEXO = 10 * 1024 * 1024
export const MAXIMO_ANEXOS_POR_REVISAO = 10
