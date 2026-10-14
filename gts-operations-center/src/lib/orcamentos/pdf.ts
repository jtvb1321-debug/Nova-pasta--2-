import type { ConteudoRelatorio, SecaoRelatorio } from '@/lib/diagnosticoConexao/relatorio'
import { dataBR, dataValidade, formatarBRL, formatarCnpj, formatarQuantidade, numeroFormatado, totalItem, totais } from './calculo'

// Conteudo do PDF do orcamento, no mesmo estilo do Relatorio Tecnico de Conectividade (logo, titulo, secoes numeradas,
// tabelas em grade, preto e branco). Funcao pura: o desenho em A4 e' o mesmo renderizarPdf do relatorio.

export interface OrcamentoParaPdf {
  numero: number
  emissao: Date
  validadeDias: number
  condicoesPagamento: string | null
  prazoEntrega: string | null
  observacoes: string | null
  descontoGeral: number
  empresa: {
    razaoSocial: string; nomeFantasia: string | null; cnpj: string | null; inscricaoEstadual: string | null; contatoNome: string | null
    email: string | null; telefone: string | null; endereco: string | null; numero: string | null; complemento: string | null
    bairro: string | null; cidade: string | null; uf: string | null; cep: string | null
  }
  itens: { descricao: string; unidade: string; quantidade: number; valorUnitario: number; desconto: number }[]
}

const NAO_INFORMADO = '—'
const ou = (v: string | null | undefined) => (v && v.trim() ? v.trim() : NAO_INFORMADO)

export function enderecoDaEmpresa(e: OrcamentoParaPdf['empresa']): string {
  const rua = [e.endereco, e.numero].filter(Boolean).join(', ')
  const resto = [e.complemento, e.bairro, [e.cidade, e.uf].filter(Boolean).join('/'), e.cep].filter(Boolean).join(' - ')
  return [rua, resto].filter(Boolean).join(' - ')
}

export function montarConteudoOrcamento(o: OrcamentoParaPdf, emitidoPor: string, emitidoEm = new Date()): ConteudoRelatorio {
  const e = o.empresa
  const num = numeroFormatado(o.numero)
  const t = totais(o.itens, o.descontoGeral)
  const fimValidade = dataValidade(o.emissao, o.validadeDias)
  let k = 0
  const titulo = (x: string) => `${++k}. ${x}`
  const secoes: SecaoRelatorio[] = []

  secoes.push({
    titulo: titulo('Dados da empresa'),
    pares: [
      ['Razão social', e.razaoSocial],
      ['Nome fantasia', ou(e.nomeFantasia)],
      ['CNPJ', e.cnpj ? formatarCnpj(e.cnpj) : NAO_INFORMADO],
      ['Inscrição estadual', ou(e.inscricaoEstadual)],
      ['Contato', ou(e.contatoNome)],
      ['E-mail', ou(e.email)],
      ['Telefone', ou(e.telefone)],
      ['Endereço', ou(enderecoDaEmpresa(e))],
    ],
  })

  secoes.push({
    titulo: titulo('Itens do orçamento'),
    tabela: {
      colunas: ['Item', 'Descrição', 'Un.', 'Qtd.', 'Valor unit.', 'Desconto', 'Total'],
      linhas: o.itens.map((i, n) => [String(n + 1), i.descricao, i.unidade, formatarQuantidade(i.quantidade), formatarBRL(i.valorUnitario), i.desconto > 0 ? formatarBRL(i.desconto) : NAO_INFORMADO, formatarBRL(totalItem(i))]),
    },
  })

  secoes.push({
    titulo: titulo('Valores'),
    pares: [
      ['Subtotal dos itens', formatarBRL(t.subtotal)],
      ...(t.descontoItens > 0 ? [['Descontos nos itens', `- ${formatarBRL(t.descontoItens)}`] as [string, string]] : []),
      ...(t.descontoGeral > 0 ? [['Desconto geral', `- ${formatarBRL(t.descontoGeral)}`] as [string, string]] : []),
      ['TOTAL', formatarBRL(t.total)],
    ],
  })

  secoes.push({
    titulo: titulo('Condições'),
    pares: [
      ['Data de emissão', dataBR(o.emissao)],
      ['Validade da proposta', `até ${dataBR(fimValidade)} (${o.validadeDias} dia${o.validadeDias === 1 ? '' : 's'})`],
      ['Condições de pagamento', ou(o.condicoesPagamento)],
      ['Prazo de entrega/execução', ou(o.prazoEntrega)],
    ],
  })

  if (o.observacoes?.trim()) secoes.push({ titulo: titulo('Observações'), paragrafos: [o.observacoes.trim()] })

  secoes.push({
    titulo: titulo('Emissão'),
    pares: [['Elaborado por', emitidoPor], ['Emitido em', `${dataBR(emitidoEm)} ${String(emitidoEm.getHours()).padStart(2, '0')}:${String(emitidoEm.getMinutes()).padStart(2, '0')}`]],
  })

  const nomeBase = (e.nomeFantasia || e.razaoSocial).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40)
  return {
    titulo: `Orçamento ${num}`,
    subtitulo: 'GTSNET Provedor de Internet',
    secoes,
    nomeArquivo: `orcamento-${num.toLowerCase()}-${nomeBase || 'empresa'}.pdf`,
    rodape: `GTSNET · Orçamento ${num} · Proposta válida até ${dataBR(fimValidade)}`,
    logoOrbia: true,
  }
}
