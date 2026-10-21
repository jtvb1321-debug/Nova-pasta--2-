import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Fotos da vistoria. Ficam FORA de public/: so sao entregues por /api/frota/fotos/[id], depois de checar o acesso.
// FROTA_UPLOAD_DIR permite apontar para outro disco; o padrao e' <app>/uploads-frota.

export const TAMANHO_MAXIMO_FOTO = 8 * 1024 * 1024

export function pastaFotos(): string {
  return process.env.FROTA_UPLOAD_DIR?.trim() || join(process.cwd(), 'uploads-frota')
}

/** Tipo pela assinatura do arquivo (nao confia no tipo nem no nome enviados). */
export function tipoPorAssinatura(b: Buffer): { ext: 'jpg' | 'png' | 'webp'; mime: string } | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' }
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' }
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', mime: 'image/webp' }
  return null
}

const NOME_SEGURO = /^[A-Za-z0-9_-]{1,40}\.(jpg|png|webp)$/

export async function gravarFoto(id: string, ext: string, dados: Buffer): Promise<string> {
  const nome = `${id}.${ext}`
  if (!NOME_SEGURO.test(nome)) throw new Error('nome de arquivo invalido')
  await mkdir(pastaFotos(), { recursive: true })
  await writeFile(join(pastaFotos(), nome), dados)
  return nome
}

export async function lerFoto(nome: string): Promise<Buffer | null> {
  if (!NOME_SEGURO.test(nome)) return null
  try { return await readFile(join(pastaFotos(), nome)) } catch { return null }
}

export async function apagarFoto(nome: string): Promise<void> {
  if (!NOME_SEGURO.test(nome)) return
  try { await unlink(join(pastaFotos(), nome)) } catch { /* ja nao existe */ }
}
