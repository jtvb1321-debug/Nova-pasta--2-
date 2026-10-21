import { z } from 'zod'

// Regras da vistoria de frota (funcoes puras; o servidor e a tela usam as mesmas).

export const TIPOS_VISTORIA = ['SEMANAL', 'CONFERENCIA_INICIAL', 'SAIDA', 'RETORNO', 'AUDITORIA'] as const
export type TipoVistoria = (typeof TIPOS_VISTORIA)[number]
export const ROTULO_TIPO: Record<TipoVistoria, string> = {
  SEMANAL: 'Vistoria semanal', CONFERENCIA_INICIAL: 'Conferência inicial', SAIDA: 'Saída', RETORNO: 'Retorno', AUDITORIA: 'Auditoria',
}

export const COMBUSTIVEIS = ['RESERVA', 'UM_QUARTO', 'MEIO', 'TRES_QUARTOS', 'CHEIO'] as const
export type Combustivel = (typeof COMBUSTIVEIS)[number]
export const ROTULO_COMBUSTIVEL: Record<Combustivel, string> = { RESERVA: 'Reserva', UM_QUARTO: '1/4', MEIO: '1/2', TRES_QUARTOS: '3/4', CHEIO: 'Cheio' }

export const STATUS_ITEM = ['OK', 'FALTA', 'AVARIA'] as const
export type StatusItem = (typeof STATUS_ITEM)[number]
export const ROTULO_STATUS: Record<StatusItem, string> = { OK: 'OK', FALTA: 'Falta', AVARIA: 'Avaria' }

export const KM_MAXIMO = 2_000_000
export const DESCRICAO_MIN = 3

/** Placa antiga (ABC1234) ou Mercosul (ABC1D23), sem hifen, maiusculas. */
export const PLACA_RE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/
export const normalizarPlaca = (v: string) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
export const placaValida = (v: string) => PLACA_RE.test(normalizarPlaca(v))
export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const

// ----------------------------------------------------------------- entrada da vistoria
const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'identificador inválido')

export const entradaVistoriaSchema = z.object({
  veiculoId: id,
  tipo: z.enum(TIPOS_VISTORIA).default('SEMANAL'),
  km: z.number({ invalid_type_error: 'Informe o km do painel.', required_error: 'Informe o km do painel.' }).int('O km deve ser um número inteiro.').min(0, 'O km não pode ser negativo.').max(KM_MAXIMO, 'Km fora do limite.'),
  combustivel: z.enum(COMBUSTIVEIS, { errorMap: () => ({ message: 'Informe o nível de combustível.' }) }),
  observacoes: z.string().trim().max(2000, 'Observações: no máximo 2000 caracteres.').optional(),
  confirmarKmMenor: z.boolean().optional(),
  itens: z.array(z.object({
    itemId: id,
    status: z.enum(STATUS_ITEM),
    descricao: z.string().trim().max(500, 'Descrição: no máximo 500 caracteres.').optional(),
    fotoId: id.optional(),
  }).strict()).max(500),
  fotos: z.array(z.object({ fotoObrigatoriaId: id, fotoId: id }).strict()).max(50),
}).strict()
export type EntradaVistoria = z.infer<typeof entradaVistoriaSchema>

export interface ConfigVistoria {
  /** So os itens exigidos entram na vistoria. */
  itens: { id: string; categoria: string; nome: string; quantidade: number | null }[]
  fotosObrigatorias: { id: string; nome: string }[]
}

export interface FotoEnviada { veiculoId: string; tipo: string; enviadoPorId: string; vistoriaId: string | null }

export interface ErroVistoria { campo: string; mensagem: string }

export interface ResultadoValidacao {
  ok: boolean
  erros: ErroVistoria[]
  /** O km informado e' menor que o km atual da viatura e ainda nao foi confirmado. */
  pedirConfirmacaoKm: boolean
}

/**
 * Valida a vistoria contra a configuracao ATUAL: km, todos os itens exigidos marcados, descricao em Falta/Avaria,
 * foto em Avaria e todas as fotos obrigatorias. As fotos tem que ser do mesmo veiculo, enviadas por quem vistoria
 * e ainda sem vistoria.
 */
export function validarVistoria(
  e: EntradaVistoria,
  config: ConfigVistoria,
  fotos: Map<string, FotoEnviada>,
  ctx: { vistoriadorId: string; kmAtual: number | null },
): ResultadoValidacao {
  const erros: ErroVistoria[] = []
  const fotoValida = (fotoId: string, tipo: 'OBRIGATORIA' | 'AVARIA') => {
    const f = fotos.get(fotoId)
    return !!f && f.tipo === tipo && f.veiculoId === e.veiculoId && f.enviadoPorId === ctx.vistoriadorId && f.vistoriaId === null
  }

  const pedirConfirmacaoKm = ctx.kmAtual != null && e.km < ctx.kmAtual && !e.confirmarKmMenor

  const porId = new Map(config.itens.map(i => [i.id, i]))
  const enviados = new Map<string, EntradaVistoria['itens'][number]>()
  for (const i of e.itens) {
    if (!porId.has(i.itemId)) { erros.push({ campo: `itens.${i.itemId}`, mensagem: 'Item não faz parte da lista exigida.' }); continue }
    if (enviados.has(i.itemId)) { erros.push({ campo: `itens.${i.itemId}`, mensagem: `Item repetido: ${porId.get(i.itemId)!.nome}.` }); continue }
    enviados.set(i.itemId, i)
  }
  const usadas = new Set<string>()
  for (const cfg of config.itens) {
    const i = enviados.get(cfg.id)
    if (!i) { erros.push({ campo: `itens.${cfg.id}`, mensagem: `Marque o item "${cfg.nome}".` }); continue }
    if (i.status !== 'OK' && (i.descricao ?? '').trim().length < DESCRICAO_MIN) {
      erros.push({ campo: `itens.${cfg.id}`, mensagem: `Descreva o problema em "${cfg.nome}".` })
    }
    if (i.status === 'AVARIA') {
      if (!i.fotoId || !fotoValida(i.fotoId, 'AVARIA') || usadas.has(i.fotoId)) erros.push({ campo: `itens.${cfg.id}`, mensagem: `Anexe a foto da avaria em "${cfg.nome}".` })
      else usadas.add(i.fotoId)
    } else if (i.fotoId) {
      erros.push({ campo: `itens.${cfg.id}`, mensagem: `Foto só é aceita em itens com avaria ("${cfg.nome}").` })
    }
  }

  const fotoPorExigida = new Map<string, string>()
  for (const f of e.fotos) {
    if (fotoPorExigida.has(f.fotoObrigatoriaId)) erros.push({ campo: `fotos.${f.fotoObrigatoriaId}`, mensagem: 'Foto repetida.' })
    else fotoPorExigida.set(f.fotoObrigatoriaId, f.fotoId)
  }
  const exigidas = new Set(config.fotosObrigatorias.map(f => f.id))
  for (const f of e.fotos) if (!exigidas.has(f.fotoObrigatoriaId)) erros.push({ campo: `fotos.${f.fotoObrigatoriaId}`, mensagem: 'Foto não faz parte da lista exigida.' })
  for (const exigida of config.fotosObrigatorias) {
    const fotoId = fotoPorExigida.get(exigida.id)
    if (!fotoId || !fotoValida(fotoId, 'OBRIGATORIA') || usadas.has(fotoId)) erros.push({ campo: `fotos.${exigida.id}`, mensagem: `Falta a foto: ${exigida.nome}.` })
    else usadas.add(fotoId)
  }

  return { ok: erros.length === 0 && !pedirConfirmacaoKm, erros, pedirConfirmacaoKm }
}

export function totaisVistoria(itens: { status: StatusItem }[]) {
  return {
    totalOk: itens.filter(i => i.status === 'OK').length,
    totalFalta: itens.filter(i => i.status === 'FALTA').length,
    totalAvaria: itens.filter(i => i.status === 'AVARIA').length,
  }
}

/** Km novo que passa a valer na viatura: so sobe (km menor confirmado nao rebaixa o cadastro). */
export function novoKmDaViatura(kmAtual: number | null, kmVistoria: number): number | null {
  return kmAtual == null || kmVistoria > kmAtual ? kmVistoria : null
}
