import { formatarBytes, formatarMbps } from './formato'
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
  if (d.sessoes.disponivel) {
    linhas.push(`Sessões: ${d.sessoes.desconexoes} desconexão(ões) registrada(s) e ${d.sessoes.emCurso} sessão(ões) em curso.`)
  }
  linhas.push('Não foram obtidos velocidade medida, latência, jitter, perda de pacotes nem estabilidade. O consumo registrado, isoladamente, não permite concluir que a conexão esteja estável ou normal.')
  return linhas
}
