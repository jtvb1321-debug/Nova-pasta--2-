// Abre o arquivo exportado do OPA (zip com um PDF por atendimento, ou um PDF solto) e devolve os historicos lidos.
// So em memoria: nada e' gravado em disco e nenhum conteudo de conversa sai daqui (ver historicoPdf.ts).
// Protecoes: limite de arquivos, de tamanho por PDF e do total descompactado (zip malicioso/gigante).

import { unzipSync } from 'fflate'
import { extractText, getDocumentProxy } from 'unpdf'
import { lerHistorico, type HistoricoAtendimento } from './historicoPdf'

export const LIMITES_HISTORICOS = {
  /** Tamanho maximo do arquivo enviado (zip ou pdf). */
  arquivoBytes: 60 * 1024 * 1024,
  /** Quantidade maxima de PDFs lidos por envio. */
  maxPdfs: 6000,
  /** Tamanho maximo de cada PDF dentro do zip. */
  pdfBytes: 4 * 1024 * 1024,
  /** Soma maxima dos PDFs descompactados. */
  totalBytes: 400 * 1024 * 1024,
}

export class ArquivoInvalido extends Error {}

export interface ResultadoLeitura {
  historicos: HistoricoAtendimento[]
  /** PDFs abertos com sucesso. */
  lidos: number
  /** PDFs que nao parecem um historico do OPA (sem protocolo/horario) ou que nao abriram. */
  ignorados: number
  /** Mesmo protocolo mais de uma vez no envio (mantido o primeiro). */
  repetidos: number
}

const ehPdf = (nome: string) => /\.pdf$/i.test(nome) && !nome.includes('__MACOSX')

async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes)
  const r = await extractText(pdf, { mergePages: false })
  return r.text.join('\n')
}

/** Aceita o zip do OPA ou um unico PDF. Erros esperados viram ArquivoInvalido (mensagem segura para a tela). */
export async function lerArquivoHistoricos(dados: Uint8Array, nome: string, opcoes: { permitirVazio?: boolean } = {}): Promise<ResultadoLeitura> {
  if (dados.byteLength === 0) throw new ArquivoInvalido('O arquivo está vazio.')
  if (dados.byteLength > LIMITES_HISTORICOS.arquivoBytes) throw new ArquivoInvalido('O arquivo é grande demais. Envie por períodos menores (até uns 60 MB).')

  let pdfs: { nome: string; bytes: Uint8Array }[]
  const assinaturaZip = dados[0] === 0x50 && dados[1] === 0x4b
  const assinaturaPdf = dados[0] === 0x25 && dados[1] === 0x50 && dados[2] === 0x44 && dados[3] === 0x46
  if (assinaturaZip) {
    let total = 0
    let quantidade = 0
    let arquivos: Record<string, Uint8Array>
    try {
      arquivos = unzipSync(dados, {
        filter: f => {
          if (!ehPdf(f.name)) return false
          if (f.originalSize > LIMITES_HISTORICOS.pdfBytes) return false
          quantidade++
          total += f.originalSize
          if (quantidade > LIMITES_HISTORICOS.maxPdfs) throw new ArquivoInvalido(`O zip tem PDFs demais (máximo ${LIMITES_HISTORICOS.maxPdfs} por envio). Envie por períodos menores.`)
          if (total > LIMITES_HISTORICOS.totalBytes) throw new ArquivoInvalido('O conteúdo do zip é grande demais. Envie por períodos menores.')
          return true
        },
      })
    } catch (e) {
      if (e instanceof ArquivoInvalido) throw e
      throw new ArquivoInvalido('Não foi possível abrir o zip. Baixe o relatório de novo no OPA.')
    }
    pdfs = Object.entries(arquivos).map(([n, bytes]) => ({ nome: n, bytes }))
    if (pdfs.length === 0) throw new ArquivoInvalido('O zip não tem nenhum PDF de atendimento.')
  } else if (assinaturaPdf || /\.pdf$/i.test(nome)) {
    pdfs = [{ nome, bytes: dados }]
  } else {
    throw new ArquivoInvalido('Envie o arquivo .zip exportado do OPA (ou um PDF de atendimento).')
  }

  const vistos = new Set<string>()
  const historicos: HistoricoAtendimento[] = []
  let lidos = 0, ignorados = 0, repetidos = 0
  for (const p of pdfs) {
    try {
      const h = lerHistorico(await textoDoPdf(new Uint8Array(p.bytes)))
      if (!h) { ignorados++; continue }
      lidos++
      if (vistos.has(h.protocolo)) { repetidos++; continue }
      vistos.add(h.protocolo)
      historicos.push(h)
    } catch {
      ignorados++ // PDF corrompido/protegido: segue com os demais, sem expor o motivo tecnico
    }
  }
  if (historicos.length === 0 && !opcoes.permitirVazio) throw new ArquivoInvalido('Nenhum atendimento do OPA foi reconhecido nos arquivos enviados.')
  return { historicos, lidos, ignorados, repetidos }
}
