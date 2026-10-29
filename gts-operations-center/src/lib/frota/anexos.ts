import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pastaFotos, tipoPorAssinatura } from './fotos'

// Notas fiscais das revisoes (PDF ou foto). Ficam na mesma pasta das fotos da vistoria (FROTA_UPLOAD_DIR), fora de public/,
// e so sao entregues por /api/frota/revisao-anexos/[id] depois de checar o acesso.

import { MAXIMO_ANEXOS_POR_REVISAO, TAMANHO_MAXIMO_ANEXO } from './revisoes'
export { MAXIMO_ANEXOS_POR_REVISAO, TAMANHO_MAXIMO_ANEXO }

export interface TipoAnexo { ext: 'pdf' | 'jpg' | 'png' | 'webp'; mime: string }

/** Tipo pela assinatura do arquivo (nao confia no tipo nem no nome enviados). */
export function tipoAnexoPorAssinatura(b: Buffer): TipoAnexo | null {
  if (b.length > 12 && b.subarray(0, 5).toString('latin1') === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' }
  return tipoPorAssinatura(b)
}

const NOME_SEGURO = /^rev-[A-Za-z0-9-]{1,40}\.(pdf|jpg|png|webp)$/

/** Nome mostrado ao usuario: sem pasta, sem caracteres de controle, tamanho limitado. */
export function nomeExibicao(nome: string, ext: string): string {
  const base = String(nome ?? '').split(/[\\/]/).pop() ?? ''
  const limpo = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)
  return limpo || `nota-fiscal.${ext}`
}

export async function gravarAnexo(id: string, ext: string, dados: Buffer): Promise<string> {
  const nome = `rev-${id}.${ext}`
  if (!NOME_SEGURO.test(nome)) throw new Error('nome de arquivo invalido')
  await mkdir(pastaFotos(), { recursive: true })
  await writeFile(join(pastaFotos(), nome), dados)
  return nome
}

export async function lerAnexo(nome: string): Promise<Buffer | null> {
  if (!NOME_SEGURO.test(nome)) return null
  try { return await readFile(join(pastaFotos(), nome)) } catch { return null }
}

export async function apagarAnexo(nome: string): Promise<void> {
  if (!NOME_SEGURO.test(nome)) return
  try { await unlink(join(pastaFotos(), nome)) } catch { /* ja nao existe */ }
}
