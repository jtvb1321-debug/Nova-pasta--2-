import { registrarLog } from '@/lib/auditLog'
import { buscarClientes, consultarConexao } from '@/lib/diagnosticoConexao/servico'
import { formatarBytes, formatarDuracao, formatarMbps } from '@/lib/diagnosticoConexao/formato'
import { resumoTecnico } from '@/lib/diagnosticoConexao/resumo'
import { ErroDiagnostico, INDICADORES_NAO_MEDIDOS, NAO_DISPONIVEL, type ContratoConexao } from '@/lib/diagnosticoConexao/tipos'
import { exigirArea } from '../autorizacao'
import { consumirLimite } from '../limites'
import { ErroFerramenta, type ContextoIA, type Indicador } from '../tipos'
import { montarResultado } from './comum'

// Diagnostico de Conexao pelo assistente. SOMENTE LEITURA, SOMENTE IXC (mesmo servico da tela).
// O que vai ao modelo nao tem nome de cliente, login nem IP: nomes e logins aparecem so nas tabelas da tela.
// O assistente nunca conclui que a conexao esta "estavel" ou "normal" so porque ha consumo: o resumo
// vem pronto de resumoTecnico() e diz o que o IXC informou e o que nao foi medido.

export interface ParamsConexao {
  busca?: string
  clienteId?: string
  contratoId?: string
  login?: string
  periodo?: '7d' | '30d'
  vdi?: boolean
}

const AVISO_REGRA = 'Volume consumido (GB) não é velocidade (Mbps). Velocidade medida, latência, jitter, perda de pacotes e estabilidade não são fornecidos pelo IXC e não são estimados.'
const FONTE = ['ixc: cliente', 'ixc: cliente_contrato', 'ixc: radusuarios', 'ixc: radgrupos', 'ixc: radacct', 'smartolt: onus']

function traduzir(e: unknown): never {
  if (e instanceof ErroDiagnostico) {
    throw new ErroFerramenta(e.codigo === 'INVALIDO' ? 'INVALIDO' : e.codigo === 'NAO_ENCONTRADO' ? 'NAO_ENCONTRADO' : 'ERRO', e.message)
  }
  throw e
}

function linkDiagnostico(c: { cliente: string; contrato?: string; login?: string; periodo: string; vdi?: boolean }) {
  const q = new URLSearchParams({ cliente: c.cliente, periodo: c.periodo })
  if (c.contrato) q.set('contrato', c.contrato)
  if (c.login) q.set('login', c.login)
  if (c.vdi) q.set('vdi', '1')
  return `/diagnostico-conexao?${q.toString()}`
}

const rotuloContrato = (c: ContratoConexao) => `${c.plano ?? 'Plano não informado'}`

export async function diagnosticoConexao(ctx: ContextoIA, p: ParamsConexao) {
  exigirArea(ctx, 'operacoes')
  if (!ctx.permissoes.verDiagnosticoConexao) throw new ErroFerramenta('NEGADO', 'Seu perfil não tem permissão para o Diagnóstico de Conexão.')
  const l = consumirLimite(`dc:${ctx.usuarioId}`, 20, 400)
  if (!l.ok) throw new ErroFerramenta('LIMITE', 'Muitas consultas de conexão em pouco tempo. Aguarde um instante.')

  const periodo = p.periodo ?? '30d'
  let clienteId = p.clienteId
  try {
    // 1) Descobre o cliente (por nome, codigo, contrato ou login).
    if (!clienteId) {
      const termo = (p.busca ?? '').trim()
      if (!termo) throw new ErroFerramenta('INVALIDO', 'Informe o nome, o código do cliente, o contrato ou o login para consultar a conexão.')
      const achados = await buscarClientes(termo)
      await registrarLog({ usuarioId: ctx.usuarioId, acao: 'DIAGNOSTICO_CONEXAO_BUSCA', entidade: 'Cliente IXC', detalhes: `Busca pelo assistente: ${achados.length} resultado(s)` })
      if (achados.length === 0) {
        return montarResultado({
          resumo: 'Nenhum cliente encontrado no IXC com esse termo. Tente outro nome, o código do cliente, o contrato ou o login.',
          dados: { situacao: 'nenhum-cliente' }, tabelas: FONTE.slice(0, 1),
        })
      }
      if (achados.length > 1) {
        return montarResultado({
          resumo: `Encontrei ${achados.length} clientes no IXC com esse termo. Peça para a pessoa informar o código do cliente (aparece na tabela da tela) para eu consultar a conexão.`,
          dados: { situacao: 'varios-clientes', quantidade: achados.length },
          recomendacoes: ['Responda com o código do cliente, por exemplo: "diagnóstico de conexão do cliente 1234".'],
          tabelas: FONTE.slice(0, 1),
          tabelasTela: [{ titulo: 'Clientes encontrados', colunas: ['Código', 'Cliente', 'Achado por'], linhas: achados.map(a => [a.codigo, a.nome, a.origem]) }],
        })
      }
      clienteId = achados[0].codigo
      // Achou pelo numero do contrato: ja e' o contrato escolhido.
      if (achados[0].origem === 'contrato' && !p.contratoId && /^\d{1,12}$/.test(termo)) p = { ...p, contratoId: termo }
    }

    // 2) Consulta a conexao (mesmo servico da tela).
    const r = await consultarConexao({ codigoCliente: clienteId, contratoId: p.contratoId, login: p.login, periodo })

    if (r.tipo === 'sem-contrato') {
      return montarResultado({ resumo: 'O cliente foi encontrado, mas não tem contrato de internet cadastrado no IXC.', dados: { situacao: 'sem-contrato' }, tabelas: FONTE.slice(0, 3) })
    }
    if (r.tipo === 'escolher-contrato') {
      return montarResultado({
        resumo: `O cliente tem ${r.contratos.length} contratos. Pergunte à pessoa qual contrato analisar (o número aparece na tabela da tela) e consulte de novo informando contratoId.`,
        dados: { situacao: 'escolher-contrato', contratos: r.contratos.map(c => ({ contratoId: c.id, plano: c.plano, situacao: c.status, internet: c.internet, logins: c.logins.length })) },
        recomendacoes: ['Responda com o número do contrato que deseja analisar.'],
        tabelas: FONTE.slice(0, 3),
        tabelasTela: [{
          titulo: `Contratos do cliente ${r.cliente.codigo}${r.cliente.nome ? ` · ${r.cliente.nome}` : ''}`,
          colunas: ['Contrato', 'Plano', 'Situação', 'Internet', 'Logins'],
          linhas: r.contratos.map(c => [c.id, rotuloContrato(c), c.status ?? '—', c.internet ?? '—', c.logins.map(x => x.login).join(', ') || '—']),
        }],
      })
    }
    if (r.tipo === 'escolher-login') {
      return montarResultado({
        resumo: 'O contrato tem mais de um login de conexão. Pergunte à pessoa qual login analisar (aparece na tabela da tela) e consulte de novo informando login.',
        dados: { situacao: 'escolher-login', quantidadeLogins: r.contrato.logins.length },
        tabelas: FONTE.slice(0, 3),
        tabelasTela: [{ titulo: `Logins do contrato ${r.contrato.id}`, colunas: ['Login', 'Conectado agora', 'Ativo'], linhas: r.contrato.logins.map(x => [x.login, x.online ? 'Sim' : 'Não', x.ativo ? 'Sim' : 'Não']) }],
      })
    }

    // 3) Diagnostico completo.
    const d = r.diagnostico
    await registrarLog({
      usuarioId: ctx.usuarioId, acao: 'DIAGNOSTICO_CONEXAO_CONSULTA', entidade: 'Cliente IXC', entidadeId: d.identificacao.cliente.codigo,
      detalhes: `Pelo assistente. Contrato ${d.identificacao.contrato.id}, ${d.periodo.inicio} a ${d.periodo.fim}`,
    })
    const v = d.identificacao.velocidade
    const indicadores: Indicador[] = [
      { rotulo: 'Download contratado', valor: v.downloadMbps != null ? formatarMbps(v.downloadMbps) : NAO_DISPONIVEL, detalhe: 'Velocidade do plano, não medida' },
      { rotulo: 'Upload contratado', valor: v.uploadMbps != null ? formatarMbps(v.uploadMbps) : NAO_DISPONIVEL, detalhe: 'Velocidade do plano, não medida' },
      d.consumo.disponivel
        ? { rotulo: 'Consumo de download', valor: formatarBytes(d.consumo.downloadBytes), detalhe: `Volume em ${d.periodo.rotulo}, não velocidade` }
        : { rotulo: 'Consumo de download', valor: NAO_DISPONIVEL, tom: 'alerta' },
      d.consumo.disponivel
        ? { rotulo: 'Consumo de upload', valor: formatarBytes(d.consumo.uploadBytes), detalhe: `Volume em ${d.periodo.rotulo}, não velocidade` }
        : { rotulo: 'Consumo de upload', valor: NAO_DISPONIVEL, tom: 'alerta' },
    ]
    const sa = d.sessaoAtual
    if (sa.disponivel) {
      if (sa.tempoConectadoSegundos != null) indicadores.push({ rotulo: 'Conectado há', valor: formatarDuracao(sa.tempoConectadoSegundos), detalhe: sa.inicio ? `Desde ${sa.inicio}` : undefined })
      if (sa.downloadBytes != null) indicadores.push({ rotulo: 'Download da sessão atual', valor: formatarBytes(sa.downloadBytes), detalhe: 'Volume desde o início da conexão, não velocidade' })
      if (sa.uploadBytes != null) indicadores.push({ rotulo: 'Upload da sessão atual', valor: formatarBytes(sa.uploadBytes), detalhe: 'Volume desde o início da conexão, não velocidade' })
    }
    const eq = d.equipamento
    if (eq.disponivel && eq.sinalRxDbm != null) indicadores.push({ rotulo: 'Sinal óptico da ONU (RX)', valor: `${eq.sinalRxDbm} dBm`, detalhe: `Leitura da OLT (SmartOLT) · ONU ${eq.status ?? 'sem status'}` })
    if (d.sessoes.disponivel) {
      indicadores.push({ rotulo: 'Desconexões no período', valor: d.sessoes.desconexoes, detalhe: `${d.sessoes.emCurso} sessão(ões) em curso` })
    }

    const resumo = resumoTecnico(d)
    const cliente = d.identificacao.cliente
    const lg = d.identificacao.login
    return montarResultado({
      resumo: resumo.join(' '),
      dados: {
        situacao: 'diagnostico',
        periodo: { inicio: d.periodo.inicio, fim: d.periodo.fim, rotulo: d.periodo.rotulo },
        plano: d.identificacao.contrato.plano,
        situacaoContrato: d.identificacao.contrato.status,
        situacaoInternet: d.identificacao.contrato.internet,
        conectadoAgora: lg ? lg.online : null,
        velocidadeContratadaMbps: { download: v.downloadMbps, upload: v.uploadMbps, observacao: 'valor do plano, não medido' },
        consumoVolume: d.consumo.disponivel
          ? { downloadGB: Math.round((d.consumo.downloadBytes / 1024 ** 3) * 100) / 100, uploadGB: Math.round((d.consumo.uploadBytes / 1024 ** 3) * 100) / 100, observacao: 'volume, não velocidade' }
          : { indisponivel: NAO_DISPONIVEL, motivo: d.consumo.motivo },
        sessoes: d.sessoes.disponivel
          ? { total: d.sessoes.total, desconexoes: d.sessoes.desconexoes, emCurso: d.sessoes.emCurso, motivosDesconexao: d.sessoes.motivos }
          : { indisponivel: NAO_DISPONIVEL, motivo: d.sessoes.motivo },
        conexaoAtual: sa.disponivel
          ? { conectado: sa.online, desde: sa.inicio, tempoConectado: sa.tempoConectadoSegundos != null ? formatarDuracao(sa.tempoConectadoSegundos) : null, downloadSessaoGB: sa.downloadBytes != null ? Math.round((sa.downloadBytes / 1024 ** 3) * 100) / 100 : null, uploadSessaoGB: sa.uploadBytes != null ? Math.round((sa.uploadBytes / 1024 ** 3) * 100) / 100 : null, ultimaDesconexao: sa.ultimaDesconexao, motivoUltimaDesconexao: sa.motivoUltimaDesconexao, desconexoesContadasPeloIxc: sa.desconexoes, observacao: 'volume desde o início da conexão atual, não velocidade' }
          : { indisponivel: NAO_DISPONIVEL, motivo: sa.motivo },
        onuSmartOlt: eq.disponivel ? { status: eq.status, sinalRxDbm: eq.sinalRxDbm, sinalTxDbm: eq.sinalTxDbm, observacao: 'leitura da OLT; não mede velocidade nem estabilidade' } : { indisponivel: NAO_DISPONIVEL, motivo: eq.motivo },
        naoMedidosPeloIxc: [...INDICADORES_NAO_MEDIDOS],
        vdiVpn: p.vdi ? 'Análise de VDI/VPN/servidor remoto: consumo e velocidade contratada não comprovam ausência de problema; sem medições (latência, jitter, perda) não há conclusão de normalidade.' : undefined,
        resumoParaOUsuario: resumo,
      },
      indicadores,
      avisos: [AVISO_REGRA, ...(p.vdi ? ['VDI/VPN/servidor remoto: sem medições de latência, jitter e perda não é possível concluir que a conexão esteja normal.'] : [])],
      recomendacoes: ['Use o botão "Abrir diagnóstico e gerar PDF" para ver o histórico completo e emitir o Relatório Técnico de Conectividade.'],
      tabelas: FONTE,
      tabelasTela: [{
        titulo: 'Conexão consultada',
        colunas: ['Cliente', 'Contrato', 'Plano', 'Login', 'Conectado agora'],
        linhas: [[`${cliente.codigo}${cliente.nome ? ` · ${cliente.nome}` : ''}`, d.identificacao.contrato.id, d.identificacao.contrato.plano ?? '—', lg?.login ?? '—', lg ? (lg.online ? 'Sim' : 'Não') : '—']],
      }],
      acoes: [{ tipo: 'abrir', rotulo: 'Abrir diagnóstico e gerar PDF', url: linkDiagnostico({ cliente: cliente.codigo, contrato: d.identificacao.contrato.id, login: lg?.login, periodo, vdi: p.vdi }) }],
    })
  } catch (e) {
    return traduzir(e)
  }
}
