import type { ConteudoRelatorio, SecaoRelatorio } from '@/lib/diagnosticoConexao/relatorio'
import { celulaCsv } from './cancelamentoNaoAtivoPdf'
import { ROTULO_SITUACAO, type FiltroEnvio, type LinhaEace, type ResumoEace, type SituacaoEnvio } from './relatorioEace'

// Conteudo do PDF e do CSV do relatorio "EACE - chamados finalizados" (mesmo estilo dos demais relatorios do Orbia).

const FUSO = 'America/Sao_Paulo'
const dmyhm = (v: string | null | undefined) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const dmyIso = (iso: string) => iso.split('-').reverse().join('/')

export const duracao = (min: number | null) => (min == null ? '—' : min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}min` : `${min}min`)

export const ROTULO_FILTRO: Record<FiltroEnvio, string> = {
  enviadas: 'Com evidências enviadas ao Telegram (confirmadas e presumidas)',
  confirmadas: 'Somente com envio confirmado pelo sistema',
  todas: 'Todos os chamados EACE finalizados no período',
}

/** Situacao do envio em uma linha curta (tabela e CSV). */
export function rotuloEnvio(l: Pick<LinhaEace, 'situacao' | 'enviadas' | 'fotos'>): string {
  const n = l.fotos.length
  switch (l.situacao as SituacaoEnvio) {
    case 'ENVIADO': return `Enviadas (${l.enviadas}/${n})`
    case 'PARCIAL': return `Parcial (${l.enviadas}/${n})`
    case 'FALHOU': return l.enviadas != null ? `Falha (${l.enviadas}/${n})` : 'Falha no envio'
    case 'PRESUMIDO': return `Presumido (${n} foto${n === 1 ? '' : 's'})`
    default: return ROTULO_SITUACAO[l.situacao]
  }
}

export interface DadosRelatorioEace { inicio: string; fim: string; filtro: FiltroEnvio; linhas: LinhaEace[]; resumo: ResumoEace }

export const CRITERIO_EACE =
  'Entram os chamados EACE com status Finalizado e conclusão dentro do período. O Orbia envia as fotos de evidência ao grupo do Telegram no momento em que o técnico finaliza o chamado e registra quantas foram aceitas pelo Telegram ("Enviadas" e "Parcial"). Chamados finalizados antes desse registro existir aparecem como "Presumido": têm fotos, foram finalizados pelo técnico e nenhuma falha de envio foi gravada. Chamados encerrados direto pelo administrador não enviam fotos ao grupo.'

/**
 * `imagens` (opcional): foto -> imagem pronta para o PDF (data URL) ou null quando o arquivo nao pode ser lido.
 * Sem ele, o PDF traz so a tabela; com ele, cada chamado ganha o detalhe e as fotos.
 */
export function montarConteudoEace(d: DadosRelatorioEace, emitidoPor: string, imagens?: Record<string, string | null>, emitidoEm = new Date()): ConteudoRelatorio {
  const r = d.resumo
  const periodo = d.inicio === d.fim ? dmyIso(d.inicio) : `${dmyIso(d.inicio)} a ${dmyIso(d.fim)}`
  let k = 0
  const t = (x: string) => `${++k}. ${x}`
  const secoes: SecaoRelatorio[] = []

  secoes.push({ titulo: t('Critério'), paragrafos: [CRITERIO_EACE, `Filtro desta emissão: ${ROTULO_FILTRO[d.filtro]}.`] })
  secoes.push({
    titulo: t('Resumo do período'),
    pares: [
      ['Período', periodo],
      ['Chamados EACE finalizados (todos)', String(r.total)],
      ['Com evidência enviada ao Telegram', String(r.comEvidenciaEnviada)],
      ['  • envio confirmado', String(r.porSituacao.ENVIADO + r.porSituacao.PARCIAL)],
      ['  • presumido (sem registro de envio)', String(r.porSituacao.PRESUMIDO)],
      ['Falha no envio', String(r.porSituacao.FALHOU)],
      ['Encerrados pelo administrador (sem envio)', String(r.porSituacao.ADMIN)],
      ['Sem fotos', String(r.porSituacao.SEM_FOTOS)],
      ['Fotos de evidência (total)', String(r.totalFotos)],
      ['Tempo médio de atendimento', duracao(r.tempoMedioMinutos)],
    ],
  })

  secoes.push(d.linhas.length
    ? {
      titulo: t(`Chamados (${d.linhas.length})`),
      tabela: {
        colunas: ['O.S.', 'Escola', 'Cidade', 'Tipo', 'Equipe', 'Concluído em', 'Tempo', 'Fotos', 'Envio ao Telegram'],
        linhas: d.linhas.map(l => [l.os, l.inep ? `${l.escola} (INEP ${l.inep})` : l.escola, l.cidade, l.tipo, l.equipe ?? '—', dmyhm(l.concluidoEm), duracao(l.tempoMinutos), String(l.fotos.length), rotuloEnvio(l)]),
      },
    }
    : { titulo: t('Chamados'), paragrafos: ['Nenhum chamado EACE finalizado encontrado no período com este filtro.'] })

  if (imagens) {
    for (const l of d.linhas) {
      const pares: [string, string][] = [
        ['Escola', l.inep ? `${l.escola} (INEP ${l.inep})` : l.escola],
        ...(l.responsavel ? [['Responsável', l.responsavel] as [string, string]] : []),
        ['Cidade / Tipo', `${l.cidade} · ${l.tipo}`],
        ['Equipe', l.equipe ?? '—'],
        ['Atendimento', `${dmyhm(l.iniciadoEm)} a ${dmyhm(l.concluidoEm)} (${duracao(l.tempoMinutos)})`],
        ['Envio ao Telegram', rotuloEnvio(l)],
      ]
      secoes.push({
        titulo: `${l.os} — ${l.escola}`,
        pares,
        ...(l.relato ? { paragrafos: [`Relato do técnico: ${l.relato}`] } : {}),
        ...(l.fotos.length ? { galeria: l.fotos.map((f, i) => ({ dataUrl: imagens[f.url] ?? null, legenda: f.legenda ? `${i + 1}. ${f.legenda}` : `Foto ${i + 1}` })) } : {}),
      })
    }
  }

  secoes.push({
    titulo: t('Emissão'),
    pares: [['Fonte dos dados', 'Orbia (chamados EACE e registro de envio ao Telegram)'], ['Elaborado por', emitidoPor], ['Emitido em', dmyhm(emitidoEm.toISOString())]],
  })

  return {
    titulo: 'EACE — Chamados finalizados com evidências',
    subtitulo: `GTSNET Provedor de Internet · ${periodo}`,
    secoes,
    nomeArquivo: `eace-finalizados-${d.inicio}-a-${d.fim}.pdf`,
    rodape: `GTSNET · EACE · Chamados finalizados · ${periodo} · Fonte: Orbia`,
    logoOrbia: true,
  }
}

/** CSV (separador ";" e BOM, para abrir direto no Excel em portugues). */
export function montarCsvEace(d: DadosRelatorioEace): string {
  const cab = ['O.S.', 'Escola', 'INEP', 'Responsável', 'Cidade', 'Tipo', 'Equipe', 'Aberto em', 'Iniciado em', 'Concluído em', 'Tempo (min)', 'Fotos', 'Fotos enviadas ao Telegram', 'Situação do envio', 'Relato']
  const linhas = d.linhas.map(l => [l.os, l.escola, l.inep, l.responsavel, l.cidade, l.tipo, l.equipe, dmyhm(l.abertoEm), dmyhm(l.iniciadoEm), dmyhm(l.concluidoEm), l.tempoMinutos, l.fotos.length, l.enviadas, ROTULO_SITUACAO[l.situacao], l.relato])
  return '﻿' + [cab, ...linhas].map(l => l.map(celulaCsv).join(';')).join('\r\n') + '\r\n'
}
