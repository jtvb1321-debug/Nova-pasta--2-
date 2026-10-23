import { foraDaFaixaRx } from './equipamento'
import { formatarBytes, formatarDuracao, formatarMbps } from './formato'
import { NAO_DISPONIVEL, type DiagnosticoConexao } from './tipos'

// Resumo tecnico em texto, montado SO com o que o IXC devolveu. Sem nome de cliente e sem login
// (pode seguir para o assistente e para a tela sem expor dado pessoal). Funcao pura.

const dmy = (iso: string) => iso.split('-').reverse().join('/')

export function resumoTecnico(d: DiagnosticoConexao): string[] {
  const linhas: string[] = []
  const v = d.identificacao.velocidade
  linhas.push(`Período analisado: ${dmy(d.periodo.inicio)} a ${dmy(d.periodo.fim)} (${d.periodo.rotulo}). Fonte: IXC Soft.`)

  const plano = d.identificacao.contrato.plano
  if (v.downloadMbps != null || v.uploadMbps != null) {
    linhas.push(`Velocidade contratada${plano ? ` (plano ${plano})` : ''}: download ${formatarMbps(v.downloadMbps)} e upload ${formatarMbps(v.uploadMbps)}. São valores do plano, não medidos na conexão.`)
  } else {
    linhas.push(`Velocidade contratada: ${NAO_DISPONIVEL}.`)
  }

  if (d.consumo.disponivel) {
    linhas.push(`O IXC registrou ${d.consumo.sessoes} sessão(ões) no período, com ${formatarBytes(d.consumo.downloadBytes)} de download e ${formatarBytes(d.consumo.uploadBytes)} de upload (volume, não velocidade).`)
  } else {
    linhas.push(`Consumo no período: ${NAO_DISPONIVEL}. ${d.consumo.motivo}`)
  }
  const sa = d.sessaoAtual
  if (sa.disponivel) {
    const partes = [sa.online
      ? `Conexão atual (cadastro do login no IXC): conectado${sa.inicio ? ` desde ${sa.inicio}` : ''}${sa.tempoConectadoSegundos != null ? ` (${formatarDuracao(sa.tempoConectadoSegundos)})` : ''}.`
      : `Conexão (cadastro do login no IXC): desconectado no momento da consulta${sa.inicio ? `; a última conexão começou em ${sa.inicio}` : ''}.`]
    if (sa.downloadBytes != null || sa.uploadBytes != null) partes.push(`Volume da ${sa.online ? 'sessão atual' : 'última sessão'}: ${formatarBytes(sa.downloadBytes)} de download e ${formatarBytes(sa.uploadBytes)} de upload (volume desde o início da conexão, não velocidade).`)
    if (sa.ultimaDesconexao) partes.push(`Última desconexão: ${sa.ultimaDesconexao}${sa.motivoUltimaDesconexao ? `, motivo ${sa.motivoUltimaDesconexao}` : ''}.`)
    if (sa.desconexoes != null) partes.push(`Desconexões contadas pelo IXC: ${sa.desconexoes}.`)
    linhas.push(partes.join(' '))
  }
  if (d.sessoes.disponivel) {
    linhas.push(`Sessões: ${d.sessoes.desconexoes} desconexão(ões) registrada(s) e ${d.sessoes.emCurso} sessão(ões) em curso.`)
  }
  if (d.equipamento.disponivel) {
    const e = d.equipamento
    const partes = [e.sinalRxDbm != null ? `sinal de recepção ${e.sinalRxDbm} dBm${foraDaFaixaRx(e.sinalRxDbm) ? ' (fora da faixa usual de -27 a -8 dBm)' : ''}` : 'sem leitura de sinal de recepção']
    if (e.sinalTxDbm != null) partes.push(`transmissão ${e.sinalTxDbm} dBm`)
    if (e.temperaturaC != null) partes.push(`temperatura ${e.temperaturaC} °C`)
    if (e.voltagemV != null) partes.push(`tensão ${e.voltagemV} V`)
    linhas.push(`ONU (leitura da OLT no IXC${e.leituraEm ? `, em ${e.leituraEm}` : ''}): ${partes.join(', ')}${e.causaUltimaQueda ? `. Causa da última queda: ${e.causaUltimaQueda}` : ''}. Sinal óptico não mede a velocidade nem a estabilidade da conexão.`)
  }
  if (d.hipoteses.length) linhas.push(`Hipóteses técnicas (regras com dados do IXC, não conclusões): ${d.hipoteses.map(h => `${h.titulo} (confiança ${h.confianca === 'media' ? 'média' : h.confianca})`).join('; ')}.`)
  linhas.push('Não foram obtidos velocidade medida, latência, jitter, perda de pacotes nem estabilidade. O consumo registrado, isoladamente, não permite concluir que a conexão esteja estável ou normal.')
  return linhas
}
