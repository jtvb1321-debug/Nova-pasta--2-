// Leitura do "Historico do atendimento" do OPA (PDF/zip). Dados FICTICIOS: nenhum cliente real.
// Teste opcional com o zip real: defina OPA_ZIP_TESTE=<caminho do .zip> (nao e' versionado; so confere a leitura).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { zipSync, strToU8 } from 'fflate'
import { jsPDF } from 'jspdf'
import { dataDoHistorico, lerHistorico } from '@/lib/gestaoDesempenho/opa/historicoPdf'
import { ArquivoInvalido, lerArquivoHistoricos } from '@/lib/gestaoDesempenho/opa/arquivoHistoricos'

const D = '26 de novembro de 2026'
const atendimento = (o: { proto?: string; cliente?: string; ab?: string; ini?: string; fim?: string; corpo: string[] }) => [
  'GTSNET', 'Histórico do atendimento',
  `Protocolo: ${o.proto ?? 'OPA2026000001'}`, `Cliente: ${o.cliente ?? 'Cliente Ficticio'}`, 'Contato: 5586000000000',
  `Horário de abertura: ${D} ${o.ab ?? '10:00'}`, `Início do atendimento: ${o.ini ? `${D} ${o.ini}` : '-'}`, `Fim do atendimento: ${o.fim ? `${D} ${o.fim}` : '-'}`,
  ...o.corpo,
].join('\n')

/** Mensagem no padrao do PDF: remetente, texto, horario (com "Lida - " opcional). */
const msg = (quem: string, texto: string, hora: string, status = '') => [quem, texto, `${status}${D} ${hora}`]

const COMPLETO = atendimento({
  ini: '10:03', fim: '10:40',
  corpo: [
    ...msg('VIC_BOT', 'Protocolo OPA2026000001', '10:00'),
    ...msg('Cliente Ficticio', 'Bom dia', '10:00'),
    ...msg('VIC_BOT', 'VIC_BOT transferiu o atendimento para *Suporte*', '10:01'),
    ...msg('Marina 🟢', 'Marina 🟢 iniciou o atendimento', '10:03', 'Lida - '),
    ...msg('Marina 🟢', 'Bom dia, em que posso ajudar?', '10:03', 'Lida - '),
    ...msg('Cliente Ficticio', 'Preciso de ajuda', '10:04'),
    '1 / 2', // rodape de pagina no meio, sem linha em branco: nao pode quebrar a leitura
    ...msg('Marina 🟢', 'Claro, vamos ver', '10:09', 'Lida - '),
    ...msg('Cliente Ficticio', 'Obrigado', '10:20'),
    ...msg('Marina 🟢', 'A Gtsnet agradece seu contato, caso precise de algo seguimos a disposição, esse atendimento será encerrado.', '10:40', 'Lida - '),
    ...msg('Marina 🟢', 'Marina 🟢 encerrou o atendimento', '10:40', 'Lida - '),
  ],
})

describe('historico do OPA: datas', () => {
  it('le "26 de novembro de 2026 15:54" como hora de Fortaleza (UTC-3)', () => {
    assert.equal(dataDoHistorico('26 de novembro de 2026 15:54')?.toISOString(), '2026-11-26T18:54:00.000Z')
    assert.equal(dataDoHistorico('1 de março de 2026 00:05')?.toISOString(), '2026-03-01T03:05:00.000Z')
    assert.equal(dataDoHistorico('-'), null)
    assert.equal(dataDoHistorico('32 de nada de 2026 10:00'), null)
  })
})

describe('historico do OPA: leitura do texto', () => {
  it('atendimento completo: atendente, departamento, espera, resposta e duracoes', () => {
    const h = lerHistorico(COMPLETO)!
    assert.equal(h.protocolo, 'OPA2026000001')
    assert.equal(h.atendente, 'Marina')
    assert.equal(h.departamento, 'Suporte')
    assert.equal(h.esperaMin, 2, 'da transferencia do robo (10:01) ate o inicio (10:03)')
    assert.equal(h.tempoRespostaMedioMin, 5, 'cliente 10:04 -> resposta 10:09; a despedida automatica nao conta')
    assert.equal(h.duracaoRegistradaMin, 37)
    assert.equal(h.duracaoAtivaMin, 17, 'ate a ultima fala real (10:20), sem a despedida das 10:40')
    assert.equal(h.transferenciasEntreAtendentes, 0)
    assert.equal(h.mensagensAtendente, 2)
    assert.equal(h.mensagensCliente, 3)
    assert.equal(h.fim?.toISOString(), '2026-11-26T13:40:00.000Z')
  })

  it('nao devolve dado de cliente: nem nome, nem contato, nem conteudo das mensagens', () => {
    const json = JSON.stringify(lerHistorico(COMPLETO))
    for (const proibido of ['Cliente Ficticio', '5586000000000', 'Preciso de ajuda', 'Claro, vamos ver']) assert.ok(!json.includes(proibido), proibido)
  })

  it('em aberto (fim "-") fica sem fim e sem duracao registrada', () => {
    const h = lerHistorico(atendimento({ proto: 'OPA2026000002', ini: '11:00', corpo: [...msg('VIC_BOT', 'Protocolo', '10:00'), ...msg('VIC_BOT', 'VIC_BOT transferiu o atendimento para *Financeiro*', '10:59'), ...msg('Marina', 'Marina iniciou o atendimento', '11:00')] }))!
    assert.equal(h.fim, null)
    assert.equal(h.duracaoRegistradaMin, null)
    assert.equal(h.departamento, 'Financeiro')
    assert.equal(h.atendente, 'Marina')
  })

  it('so o robo (ninguem assumiu): sem atendente e sem espera', () => {
    const h = lerHistorico(atendimento({ proto: 'OPA2026000003', fim: '10:05', corpo: [...msg('VIC_BOT', 'Protocolo', '10:00'), ...msg('Cliente Ficticio', '2', '10:01'), ...msg('VIC_BOT', 'Atendimento encerrado', '10:05')] }))!
    assert.equal(h.atendente, null)
    assert.equal(h.esperaMin, null)
    assert.equal(h.tempoRespostaMedioMin, null)
  })

  it('transferencia entre atendentes conta; a do robo para o departamento nao', () => {
    const h = lerHistorico(atendimento({ ini: '10:03', fim: '10:30', corpo: [...msg('VIC_BOT', 'VIC_BOT transferiu o atendimento para *Suporte*', '10:01'), ...msg('Marina', 'Marina iniciou o atendimento', '10:03'), ...msg('Marina', 'Marina transferiu o atendimento para *Financeiro*', '10:10')] }))!
    assert.equal(h.transferenciasEntreAtendentes, 1)
  })

  it('texto que nao e historico do OPA devolve null', () => {
    assert.equal(lerHistorico('qualquer coisa'), null)
    assert.equal(lerHistorico('Protocolo: X'), null)
  })

  it('atendimento que cruza a meia-noite: abertura em um dia, inicio no seguinte', () => {
    const t = COMPLETO.replace(`Início do atendimento: ${D} 10:03`, 'Início do atendimento: 27 de novembro de 2026 08:06').replace(`Fim do atendimento: ${D} 10:40`, 'Fim do atendimento: -')
    const h = lerHistorico(t)!
    assert.equal(h.abertura.toISOString(), '2026-11-26T13:00:00.000Z')
    assert.equal(h.inicio?.toISOString(), '2026-11-27T11:06:00.000Z')
    assert.equal(h.fim, null)
  })
})

/** PDF de verdade (jsPDF): cada linha vira uma linha do PDF, como no relatorio do OPA. */
function pdfDe(texto: string): Uint8Array {
  const doc = new jsPDF()
  let y = 15
  for (const linha of texto.split('\n')) {
    if (y > 280) { doc.addPage(); y = 15 }
    doc.text(linha.replace(/[^\x20-\x7EÀ-ÿ]/g, ''), 12, y)
    y += 6
  }
  return new Uint8Array(doc.output('arraybuffer'))
}

describe('historico do OPA: arquivo (zip e pdf)', () => {
  it('le um zip de PDFs reais, ignora o que nao e PDF e nao repete protocolo', async () => {
    const outro = atendimento({ proto: 'OPA2026000009', ini: '12:00', fim: '12:10', corpo: [...msg('VIC_BOT', 'VIC_BOT transferiu o atendimento para *Comercial*', '11:58'), ...msg('Bruna', 'Bruna iniciou o atendimento', '12:00')] })
    const zip = zipSync({ 'a.pdf': pdfDe(COMPLETO), 'b.pdf': pdfDe(outro), 'copia-de-a.pdf': pdfDe(COMPLETO), 'leia-me.txt': strToU8('nada'), 'lixo.pdf': strToU8('isto nao e um pdf') })
    const r = await lerArquivoHistoricos(zip, 'Atendimentos_x.zip')
    assert.equal(r.historicos.length, 2)
    assert.equal(r.lidos, 3)
    assert.equal(r.repetidos, 1)
    assert.equal(r.ignorados, 1, 'o pdf corrompido')
    const a = r.historicos.find(h => h.protocolo === 'OPA2026000001')!
    assert.equal(a.atendente, 'Marina')
    assert.equal(a.duracaoRegistradaMin, 37)
    assert.equal(r.historicos.find(h => h.protocolo === 'OPA2026000009')!.atendente, 'Bruna')
  })

  it('aceita um PDF solto', async () => {
    const r = await lerArquivoHistoricos(pdfDe(COMPLETO), 'Atendimento_OPA2026000001.pdf')
    assert.equal(r.historicos.length, 1)
  })

  it('erros esperados viram mensagem segura', async () => {
    await assert.rejects(lerArquivoHistoricos(new Uint8Array(0), 'x.zip'), ArquivoInvalido)
    await assert.rejects(lerArquivoHistoricos(strToU8('texto qualquer'), 'x.txt'), /\.zip/)
    await assert.rejects(lerArquivoHistoricos(zipSync({ 'a.txt': strToU8('x') }), 'x.zip'), /nenhum PDF/i)
    await assert.rejects(lerArquivoHistoricos(zipSync({ 'a.pdf': pdfDe('so um texto') }), 'x.zip'), /Nenhum atendimento do OPA/)
  })
})

const ZIP_REAL = process.env.OPA_ZIP_TESTE
describe('historico do OPA: zip real exportado (opcional)', { skip: !ZIP_REAL || !fs.existsSync(ZIP_REAL) }, () => {
  it('reconhece os atendimentos e identifica as atendentes', async () => {
    const r = await lerArquivoHistoricos(new Uint8Array(fs.readFileSync(ZIP_REAL!)), 'real.zip')
    assert.ok(r.historicos.length > 0)
    assert.equal(r.ignorados, 0)
    const comAtendente = r.historicos.filter(h => h.atendente).length
    console.log(`  real: ${r.historicos.length} atendimentos, ${comAtendente} com atendente: ${[...new Set(r.historicos.map(h => h.atendente).filter(Boolean))].join(', ')}`)
    assert.ok(comAtendente >= r.historicos.length - 2)
  })
})
